/**
 * 渠道管理器：UI 驱动的渠道生命周期（启用/停用/刷新二维码/状态查询）。
 *
 * - 持久化：`$DSH_HOME/dsh-im-gateway/channels.json`（UI 配置优先于 cordis config）
 * - 动态启停：无需重启 dsh，点「连接」即生效
 * - HTTP API：`/dsh-im-gateway/api/*`（Web GUI 面板调用）
 * @module dsh-im-gateway/manager
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNEL_IDS, CHANNEL_META, createChannel } from './channels/index.js';
export class ChannelManager {
    ctx;
    options;
    stateFile;
    store;
    /** 运行中的 adapter：id → { adapter }。 */
    running = new Map();
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
        this.stateFile = join(options.stateDir, 'channels.json');
        this.store = this.load();
    }
    load() {
        try {
            const raw = readFileSync(this.stateFile, 'utf8');
            const parsed = JSON.parse(raw);
            return parsed.channels ?? {};
        }
        catch {
            return {};
        }
    }
    flush() {
        try {
            mkdirSync(this.options.stateDir, { recursive: true });
            writeFileSync(this.stateFile, JSON.stringify({ channels: this.store }, null, 2));
        }
        catch (err) {
            this.options.log(`[manager] 状态落盘失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /** 合并配置：channels.json（UI）优先，cordis config 兜底。 */
    mergedConfig(id) {
        const cordis = this.options.config.channels[id] ?? {};
        return { ...cordis, ...(this.store[id] ?? {}) };
    }
    /** 启动时初始化：合并配置中 enabled 或带凭据的渠道全部启动。 */
    async initAll() {
        for (const id of CHANNEL_IDS) {
            const cfg = this.mergedConfig(id);
            const enabled = cfg.enabled === true || (this.store[id]?.enabled === true);
            if (enabled) {
                await this.connect(id).catch((err) => {
                    this.options.log(`[manager] ${id} 启动失败: ${err instanceof Error ? err.message : String(err)}`);
                });
            }
        }
    }
    /** 启用并启动一个渠道。extra 里的字段合并进配置并持久化。 */
    async connect(id, extra) {
        const meta = CHANNEL_META[id];
        if (!meta)
            return { ok: false, error: `未知渠道 ${id}` };
        // 合并 extra → store
        if (extra) {
            this.store[id] = { ...(this.store[id] ?? {}), ...extra, enabled: true };
            this.flush();
        }
        const cfg = this.mergedConfig(id);
        if (this.running.has(id)) {
            // 已运行：extra 变更时先停再启
            await this.disconnect(id);
        }
        const adapter = createChannel(id, { ...cfg, enabled: true }, this.options.log, this.options.stateDir);
        if (!adapter) {
            return { ok: false, error: `${meta.label}：缺少必要配置（${meta.needs.join(' / ') || '未知原因'}）` };
        }
        this.options.gateway.register(adapter);
        this.running.set(id, adapter);
        try {
            await adapter.start();
            this.options.log(`[manager] ${id} 已连接`);
            return { ok: true };
        }
        catch (err) {
            this.running.delete(id);
            this.options.gateway.unregister(id);
            return { ok: false, error: `${meta.label} 启动失败：${err instanceof Error ? err.message : String(err)}` };
        }
    }
    /** 停用并停止一个渠道。 */
    async disconnect(id) {
        const adapter = this.running.get(id);
        if (adapter) {
            await Promise.resolve(adapter.stop()).catch(() => undefined);
            this.running.delete(id);
            this.options.gateway.unregister(id);
        }
        if (this.store[id]) {
            this.store[id] = { ...this.store[id], enabled: false };
            this.flush();
        }
        this.options.log(`[manager] ${id} 已断开`);
    }
    /** 刷新登录（重新启停，用于重新取二维码）。 */
    async refreshLogin(id) {
        await this.disconnect(id);
        return this.connect(id);
    }
    /** 渠道视图列表（UI 渲染用）。 */
    list() {
        const out = [];
        for (const id of CHANNEL_IDS) {
            const meta = CHANNEL_META[id];
            const adapter = this.running.get(id);
            const cfg = this.mergedConfig(id);
            out.push({
                id,
                label: meta.label,
                emoji: meta.emoji,
                kind: meta.kind,
                needs: meta.needs,
                fields: meta.fields,
                hint: meta.hint,
                enabled: this.store[id]?.enabled === true || (cfg.enabled === true && !this.store[id]),
                running: adapter !== undefined,
                status: adapter?.status?.() ?? '未连接',
                loginUrl: adapter?.loginUrl?.(),
                configuredKeys: Object.keys(cfg).filter((k) => k !== 'enabled' && cfg[k] !== undefined && cfg[k] !== ''),
            });
        }
        return out;
    }
    /** 注册 HTTP API（prefix 路由，由 webServer 提供）。 */
    registerApi() {
        const webServer = this.ctx.webServer;
        if (!webServer)
            return;
        const send = (res, status, body) => {
            res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(body));
        };
        const readBody = (req) => new Promise((resolve) => {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                }
                catch {
                    resolve({});
                }
            });
        });
        webServer.register({
            kind: 'prefix',
            path: '/dsh-im-gateway/api',
            handler: async (req, res) => {
                const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
                const parts = url.pathname.split('/').filter(Boolean); // [dsh-im-gateway, api, ...]
                // /dsh-im-gateway/api/channels
                if (parts[2] === 'channels' && parts.length === 3 && req.method === 'GET') {
                    send(res, 200, { ok: true, channels: this.list() });
                    return;
                }
                // /dsh-im-gateway/api/channels/<id>/connect|disconnect|refresh
                if (parts[2] === 'channels' && parts.length === 5) {
                    const id = parts[3];
                    const action = parts[4];
                    if (req.method !== 'POST') {
                        send(res, 405, { ok: false, error: 'method not allowed' });
                        return;
                    }
                    const body = await readBody(req);
                    if (action === 'connect') {
                        const result = await this.connect(id, body.config);
                        send(res, result.ok ? 200 : 400, result.ok ? { ok: true, channel: this.list().find((c) => c.id === id) } : { ok: false, error: result.error });
                        return;
                    }
                    if (action === 'disconnect') {
                        await this.disconnect(id);
                        send(res, 200, { ok: true, channel: this.list().find((c) => c.id === id) });
                        return;
                    }
                    if (action === 'refresh') {
                        const result = await this.refreshLogin(id);
                        send(res, result.ok ? 200 : 400, result.ok ? { ok: true, channel: this.list().find((c) => c.id === id) } : { ok: false, error: result.error });
                        return;
                    }
                    send(res, 404, { ok: false, error: `unknown action ${action}` });
                    return;
                }
                send(res, 404, { ok: false, error: 'not found' });
            },
        });
        this.options.log('[manager] API 已注册（/dsh-im-gateway/api）');
    }
    /** 停用全部渠道（插件卸载时）。 */
    async disconnectAll() {
        for (const id of [...this.running.keys()]) {
            await this.disconnect(id);
        }
    }
}
//# sourceMappingURL=manager.js.map