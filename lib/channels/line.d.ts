/**
 * LINE 渠道适配器：Messaging API。
 * - 发送：REST push（零依赖）
 * - 接收：本地 HTTP server 暴露 webhook，用户需将 LINE webhook URL 指向
 *   本机（公网可达，如 cloudflared tunnel）。
 * @module dsh-im-gateway/channels/line
 */
import type { ChannelAdapter } from '../core/types.js';
export interface LineChannelConfig {
    enabled?: boolean;
    channelSecret?: string;
    /** Channel access token。 */
    channelToken?: string;
    port?: number;
    webhookPath?: string;
}
export declare function createLineChannel(config: LineChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=line.d.ts.map