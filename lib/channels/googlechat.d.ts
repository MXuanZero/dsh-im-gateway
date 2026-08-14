/**
 * Google Chat 渠道适配器（实验性）：
 * - 接收：本地 HTTP server 暴露 webhook（Google Chat 应用需配置到公网）
 * - 发送：REST messages.create（需要服务账号 access token 或 Webhook URL）
 * @module dsh-im-gateway/channels/googlechat
 */
import type { ChannelAdapter } from '../core/types.js';
export interface GoogleChatChannelConfig {
    enabled?: boolean;
    /** 本地 webhook 监听端口。 */
    port?: number;
    /** 发送用（可选）：Google Chat 空间 webhook URL（仅能回复 webhook 空间）。 */
    webhookUrl?: string;
}
export declare function createGoogleChatChannel(config: GoogleChatChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=googlechat.d.ts.map