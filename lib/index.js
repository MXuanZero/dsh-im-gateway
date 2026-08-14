/**
 * dsh-im-gateway：DeepSeek Harness 聚合 IM 网关插件。
 *
 * 把 dsh agent 接入 20+ 聊天渠道（Telegram / Discord / Slack / 飞书 / 微信 /
 * QQ / WhatsApp / Signal / Teams / LINE / Matrix / Mattermost / Google Chat /
 * IRC / Twitch / Nostr / Nextcloud Talk / Synology Chat / Zalo / iMessage /
 * WebChat …），统一提供：每聊天一个 agent 会话、/new /status /bind 等命令、
 * 审批远程应答（批准/拒绝）、手机多段输入合并、长回复分片、白名单。
 *
 * 配置：在 profile 的 cordis.patch.yml 中给 im-gateway 行写 config，
 * 或通过环境变量提供凭据（见 README）。未配置凭据的渠道不启动。
 *
 * @module dsh-im-gateway
 */
import Schema from '@deepseek-ai/schemastery';
import { ImGateway } from './core/gateway.js';
import { createChannels } from './channels/index.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
export const name = 'dsh-im-gateway';
// agents：创建/查找 agent 会话；jobs：后台任务（扫码/轮询状态对 Web UI 可见）
export const inject = ['agents', 'jobs'];
/** 网关部署配置。 */
export const Config = Schema.object({
    // 渠道配置用宽松 dict：任意渠道字段（token/appId 等）原样保留，按渠道读取
    channels: Schema.dict(Schema.any()).default({}),
    sessionMode: Schema.union(['per-chat', 'bound']).default('per-chat'),
    cwd: Schema.string().default(process.cwd()),
    provider: Schema.string().default('deepseek-official'),
    model: Schema.string().default('deepseek-v4-flash'),
    allowAllUsers: Schema.boolean().default(false),
    allowedUserIds: Schema.dict(Schema.array(Schema.string())).default({}),
    mergeTimeoutSecs: Schema.number().default(5),
    longInputAckChars: Schema.number().default(180),
    approvalTimeoutSecs: Schema.number().default(120),
    summaryOnTurnEnd: Schema.boolean().default(true),
    stateDir: Schema.string().default(''),
});
/**
 * 启动聚合网关。
 * @param ctx - Cordis 上下文；`agents`/`jobs` 由声明注入。
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
    const gateway = new ImGateway(ctx, { config, stateDir, log });
    const channels = createChannels(config, log, stateDir);
    for (const channel of channels) {
        gateway.register(channel);
        log(`[${channel.id}] 渠道已注册（${channel.label}）`);
    }
    const started = new Set();
    const startChannel = (channel) => {
        if (started.has(channel.id))
            return;
        started.add(channel.id);
        void Promise.resolve(channel.start()).catch((err) => {
            log(`[${channel.id}] 启动失败: ${err instanceof Error ? err.message : String(err)}`);
        });
    };
    ctx.effect(() => {
        for (const channel of channels)
            startChannel(channel);
        return () => {
            for (const channel of channels) {
                void Promise.resolve(channel.stop()).catch(() => undefined);
            }
            gateway.dispose();
            void gateway.stopAgents();
        };
    }, 'im-gateway.serve');
    // 后台任务：让 Web UI 能看到网关状态与扫码链接
    ctx.jobs.attachController(name);
    ctx.jobs.start({
        kind: 'im-gateway',
        label: `IM 网关（${channels.length} 个渠道: ${channels.map((c) => c.id).join(', ') || '无'}）`,
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
    if (channels.length === 0) {
        log('⚠️ 没有启用任何渠道：请在配置中填写渠道凭据，或用环境变量（见 README）');
    }
}
export * from './core/types.js';
export * from './core/gateway.js';
export * from './channels/index.js';
//# sourceMappingURL=index.js.map