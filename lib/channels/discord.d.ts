/**
 * Discord 渠道适配器：Gateway v10 WebSocket + REST，零第三方依赖
 * （使用 Node 22+ 全局 WebSocket 与 fetch）。
 * @module dsh-im-gateway/channels/discord
 */
import type { ChannelAdapter } from '../core/types.js';
export interface DiscordChannelConfig {
    enabled?: boolean;
    /** Bot token；缺省回退 DSH_DISCORD_TOKEN 环境变量。 */
    token?: string;
    /** 允许私聊的用户 id（字符串化）。 */
    allowedUserIds?: string[];
}
export declare function createDiscordChannel(config: DiscordChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=discord.d.ts.map