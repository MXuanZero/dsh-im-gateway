/**
 * Microsoft Teams 渠道适配器（实验性）：Bot Framework Activity 协议。
 * - 接收：本地 HTTP server（Teams 的 bot 消息回调，需要公网 + Bot Framework 注册）
 * - 发送：Bot Framework REST（需要 appId/appPassword + conversation 上下文）
 * 由于 Teams Bot 需要 Azure Bot Service 注册与公网回调，v0.1 提供接收骨架
 * 与凭据驱动的 REST 回复。
 * @module dsh-im-gateway/channels/msteams
 */
import type { ChannelAdapter } from '../core/types.js';
export interface MSTeamsChannelConfig {
    enabled?: boolean;
    appId?: string;
    appPassword?: string;
    port?: number;
}
export declare function createMSTeamsChannel(config: MSTeamsChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=msteams.d.ts.map