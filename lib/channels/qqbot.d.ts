/**
 * QQ 机器人渠道适配器：QQ 开放平台官方 Bot API（WebSocket 网关）。
 * 支持 C2C 私聊与群 @消息（富媒体 v0.1 不桥接，仅文本）。
 * @module dsh-im-gateway/channels/qqbot
 */
import type { ChannelAdapter } from '../core/types.js';
export interface QQBotChannelConfig {
    enabled?: boolean;
    /** QQ 开放平台 Bot 的 AppID。 */
    appId?: string;
    /** AppSecret。 */
    appSecret?: string;
}
export declare function createQQBotChannel(config: QQBotChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=qqbot.d.ts.map