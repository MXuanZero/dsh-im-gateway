/**
 * Nostr 渠道适配器（实验性）：NIP-04 加密私信。
 * 依赖 @noble/curves（可选依赖，动态 import）。需一个 nostr 私钥（hex）。
 * @module dsh-im-gateway/channels/nostr
 */
import type { ChannelAdapter } from '../core/types.js';
export interface NostrChannelConfig {
    enabled?: boolean;
    /** 中继列表，如 ["wss://relay.damus.io"]。 */
    relays?: string[];
    /** bot 私钥（hex，nsec 转 hex 后填入）。 */
    privateKey?: string;
}
export declare function createNostrChannel(config: NostrChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=nostr.d.ts.map