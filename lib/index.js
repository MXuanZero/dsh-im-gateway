/**
 * dsh-im-gateway：DeepSeek Harness 聚合 IM 网关插件。
 *
 * 把 dsh agent 接入 20+ 聊天渠道（Telegram / Discord / Slack / 飞书 / 微信 /
 * QQ / WhatsApp / Signal / Teams / LINE / Matrix / Mattermost / Google Chat /
 * IRC / Twitch / Nostr / Nextcloud Talk / Synology Chat / Zalo / iMessage /
 * WebChat …），统一提供：每聊天一个 agent 会话、/new /status /bind 等命令、
 * 审批远程应答（批准/拒绝）、手机多段输入合并、长回复分片、白名单、媒体收发。
 *
 * 两种配置方式：
 * 1. Web GUI 设置面板「IM 网关」：点选渠道 → 扫码/填凭据 → 立即连接（无需重启）
 * 2. profile 的 cordis.patch.yml 写 im-gateway 行 config（或环境变量）
 *
 * @module dsh-im-gateway
 */
import Schema from '@deepseek-ai/schemastery';
import { ImGateway } from './core/gateway.js';
import { ChannelManager } from './manager.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
export const name = 'dsh-im-gateway';
// agents：创建/查找 agent 会话；jobs：后台任务（扫码/轮询状态对 Web UI 可见）；
// tools：注册 im_send_file（agent → IM 发文件）；attachments：图片入站转 image block；
// webServer：提供设置面板调用的 HTTP API
export const inject = ['agents', 'jobs', 'tools', 'attachments', 'webServer', 'sessionQuery'];
/** 网关部署配置。 */
export const Config = Schema.object({
    // 渠道配置用宽松 dict：任意渠道字段（token/appId 等）原样保留，按渠道读取
    channels: Schema.dict(Schema.any()).default({}),
    sessionMode: Schema.union(['per-chat', 'bound']).default('per-chat'),
    cwd: Schema.string().default(process.cwd()),
    provider: Schema.string().default('deepseek-official'),
    model: Schema.string().default('deepseek-v4-flash'),
    // 默认放行所有用户（个人/小团队开箱即用）；需要管控时改为 false 并配置白名单
    allowAllUsers: Schema.boolean().default(true),
    allowedUserIds: Schema.dict(Schema.array(Schema.string())).default({}),
    mergeTimeoutSecs: Schema.number().default(5),
    longInputAckChars: Schema.number().default(180),
    approvalTimeoutSecs: Schema.number().default(120),
    summaryOnTurnEnd: Schema.boolean().default(true),
    stateDir: Schema.string().default(''),
});
/**
 * 启动聚合网关。
 * @param ctx - Cordis 上下文；声明注入的服务。
 * @param config - 部署配置。
 */
export function apply(ctx, config) {
    const stateDir = config.stateDir !== ''
        ? config.stateDir
        : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-im-gateway');
    mkdirSync(stateDir, { recursive: true });
    // 环形日志缓冲：Web UI 的 jobs readOutput 可读（扫码链接等），同时落盘便于排查
    const recent = [];
    const rawLog = ctx.logger(name);
    const logFile = join(stateDir, 'gateway.log');
    const log = (line) => {
        const stamped = `${new Date().toISOString()} ${line}`;
        recent.push(stamped);
        if (recent.length > 300)
            recent.splice(0, recent.length - 300);
        rawLog.info(line);
        try {
            writeFileSync(logFile, `${stamped}\n`, { flag: 'a' });
        }
        catch { /* 日志失败不影响运行 */ }
    };
    // 每聊天工作区偏好持久化（/workspace 命令）
    const workspaceFile = join(stateDir, 'workspaces.json');
    const workspaceStore = {
        load: () => {
            try {
                const parsed = JSON.parse(readFileSync(workspaceFile, 'utf8'));
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return [];
            }
        },
        save: (entries) => {
            try {
                mkdirSync(stateDir, { recursive: true });
                writeFileSync(workspaceFile, JSON.stringify(entries, null, 2));
            }
            catch (err) {
                log(`[manager] 工作区状态落盘失败: ${err instanceof Error ? err.message : String(err)}`);
            }
        },
    };
    const gateway = new ImGateway(ctx, { config, stateDir, log, workspaceStore });
    const manager = new ChannelManager(ctx, { config, stateDir, log, gateway });
    // 未授权用户 → 登记待授权请求（设置面板可一键批准，无需手动找用户 ID）
    gateway.setUnauthorizedHandler((channelId, msg) => {
        manager.requestAuthorization(channelId, msg.userId ?? '(匿名)', msg.username, msg.chatId);
        return '⛔ 未授权：请让管理员在 dsh 设置 → IM 网关 中批准你的访问请求。';
    });
    ctx.effect(() => {
        // 启动已启用渠道（channels.json / cordis 配置）
        void manager.initAll().then(() => {
            const running = manager.list().filter((c) => c.running);
            log(`网关启动完成：${running.length} 个渠道运行中（${running.map((c) => c.id).join(', ') || '无'}）`);
        });
        manager.registerApi();
        return () => {
            manager.disposeApi();
            void manager.disconnectAll();
            gateway.dispose();
            void gateway.stopAgents();
        };
    }, 'im-gateway.serve');
    // 后台任务：让 Web UI 能看到网关状态与扫码链接
    ctx.jobs.attachController(name);
    ctx.jobs.start({
        kind: 'im-gateway',
        label: 'IM 网关（设置面板可快速连接渠道）',
        run: () => {
            const timer = setInterval(() => {
                // 保持任务活跃；状态通过 readOutput 暴露
            }, 60_000);
            timer.unref?.();
            return {
                cancel: () => clearInterval(timer),
                done: Promise.resolve({ status: 'completed' }),
                readOutput: () => recent.splice(0).join('\n'),
            };
        },
    });
}
export * from './core/types.js';
export * from './core/gateway.js';
export * from './channels/index.js';
export * from './manager.js';
//# sourceMappingURL=index.js.map