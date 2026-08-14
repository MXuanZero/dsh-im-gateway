/**
 * Nextcloud Talk 渠道适配器（实验性）：登录拿 token → WebSocket 推送 → REST 拉消息。
 * 需要 Nextcloud 实例（支持 Talk 应用）。
 * @module dsh-im-gateway/channels/nextcloud
 */
import type { ChannelAdapter } from '../core/types.js';
export interface NextcloudChannelConfig {
    enabled?: boolean;
    /** 例如 https://nextcloud.example.com。 */
    serverUrl?: string;
    user?: string;
    password?: string;
    /** 关注的会话令牌列表（room token）。 */
    rooms?: string[];
}
export declare function createNextcloudChannel(config: NextcloudChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=nextcloud.d.ts.map