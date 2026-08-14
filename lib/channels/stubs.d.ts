/**
 * 骨架渠道适配器：Tlon（Urbit）、腾讯元宝、语音电话（Twilio/Plivo）。
 * 这三个渠道需要专用基础设施/凭据，v0.1 提供可配置骨架：
 * 启用时会明确提示当前能力边界，不静默失败。
 * @module dsh-im-gateway/channels/stubs
 */
import type { ChannelAdapter } from '../core/types.js';
export interface TlonChannelConfig {
    enabled?: boolean;
    /** Urbit ship 名，如 ~dsh-bot。 */
    ship?: string;
}
export declare function createTlonChannel(config: TlonChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
export interface YuanbaoChannelConfig {
    enabled?: boolean;
}
export declare function createYuanbaoChannel(config: YuanbaoChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
export interface VoiceChannelConfig {
    enabled?: boolean;
    /** twilio | plivo。 */
    provider?: string;
}
export declare function createVoiceChannel(config: VoiceChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=stubs.d.ts.map