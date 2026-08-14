/**
 * Twitch 渠道适配器：WebSocket IRC（原生 WebSocket），零依赖。
 * 需要 OAuth token（https://twitchtokengenerator.com 或官方 OAuth）与 bot 用户名。
 * @module dsh-im-gateway/channels/twitch
 */
import type { ChannelAdapter } from '../core/types.js';
export interface TwitchChannelConfig {
    enabled?: boolean;
    /** bot 用户名（小写）。 */
    botName?: string;
    /** OAuth token（形如 oauth:xxx 或裸 token）。 */
    token?: string;
    /** 加入的频道（小写，不带 #）。 */
    channels?: string[];
}
export declare function createTwitchChannel(config: TwitchChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=twitch.d.ts.map