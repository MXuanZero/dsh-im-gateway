/**
 * IRC 渠道适配器：原生 net.Socket 实现 IRC 客户端（零依赖）。
 * 支持频道消息与私聊 DM；自动 PING/PONG。
 * @module dsh-im-gateway/channels/irc
 */
import type { ChannelAdapter } from '../core/types.js';
export interface IrcChannelConfig {
    enabled?: boolean;
    server?: string;
    port?: number;
    nick?: string;
    password?: string;
    /** 加入的频道列表（#channel）。 */
    channels?: string[];
    /** 仅响应 @nick 提及（否则频道内所有消息都进 agent）。 */
    mentionOnly?: boolean;
}
export declare function createIrcChannel(config: IrcChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=irc.d.ts.map