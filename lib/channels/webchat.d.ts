/**
 * WebChat 渠道适配器：内置本地 HTTP 聊天服务，零依赖。
 * - GET  /            → 极简聊天页（原生 JS，SSE 收消息）
 * - POST /api/send    → 发送消息（JSON { text, token }）
 * - GET  /api/events  → SSE 出站流（assistant 回复实时推送）
 * 适合局域网/本机远程指挥 agent，无需任何第三方账号。
 * @module dsh-im-gateway/channels/webchat
 */
import type { ChannelAdapter } from '../core/types.js';
export interface WebChatChannelConfig {
    enabled?: boolean;
    port?: number;
    /** 访问口令；空 = 不鉴权（仅本机）。 */
    token?: string;
}
export declare function createWebChatChannel(config: WebChatChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=webchat.d.ts.map