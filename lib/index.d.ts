/**
 * dsh-im-gateway：DeepSeek Harness 聚合 IM 网关插件。
 *
 * 把 dsh agent 接入 20+ 聊天渠道（Telegram / Discord / Slack / 飞书 / 微信 /
 * QQ / WhatsApp / Signal / Teams / LINE / Matrix / Mattermost / Google Chat /
 * IRC / Twitch / Nostr / Nextcloud Talk / Synology Chat / Zalo / iMessage …），
 * 统一提供：每聊天一个 agent 会话、/new /status /bind 等命令、审批远程应答、
 * ask_user_question 交互提问桥、手机多段输入合并、长回复分片、白名单、媒体收发。
 *
 * 两种配置方式：
 * 1. Web GUI 设置面板「IM 网关」：点选渠道 → 扫码/填凭据 → 立即连接（无需重启）
 * 2. profile 的 cordis.patch.yml 写 im-gateway 行 config（或环境变量）
 *
 * @module dsh-im-gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
declare module '@deepseek-ai/dsh-jobs' {
    interface JobKindMap {
        'im-gateway': 'im-gateway';
    }
}
import type { ImGatewayConfig } from './core/types.js';
export declare const name = "dsh-im-gateway";
export declare const inject: string[];
/** 网关部署配置。 */
export declare const Config: Schema<ImGatewayConfig>;
/**
 * 启动聚合网关。
 * @param ctx - Cordis 上下文；声明注入的服务。
 * @param config - 部署配置。
 */
export declare function apply(ctx: Context, config: ImGatewayConfig): void;
export * from './core/types.js';
export * from './core/gateway.js';
export * from './channels/index.js';
export * from './manager.js';
//# sourceMappingURL=index.d.ts.map