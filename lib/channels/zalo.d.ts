/**
 * Zalo 渠道适配器（实验性）：Zalo OA 开放平台。
 * - 发送：REST /v3.0/im/oa/message
 * - 接收：webhook → 本地 HTTP server（Zalo 回调需公网可达）
 * @module dsh-im-gateway/channels/zalo
 */
import type { ChannelAdapter } from '../core/types.js';
export interface ZaloChannelConfig {
    enabled?: boolean;
    /** OA access token。 */
    accessToken?: string;
    port?: number;
}
export declare function createZaloChannel(config: ZaloChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=zalo.d.ts.map