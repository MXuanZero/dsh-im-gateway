/**
 * Mattermost 渠道适配器：WebSocket（authentication_challenge）+ REST，零依赖。
 * 监听 posted 事件，回复走 /api/v4/posts。
 * @module dsh-im-gateway/channels/mattermost
 */
import type { ChannelAdapter } from '../core/types.js';
export interface MattermostChannelConfig {
    enabled?: boolean;
    /** 例如 https://mattermost.example.com（不带 /api/v4）。 */
    serverUrl?: string;
    /** 个人访问令牌。 */
    token?: string;
}
export declare function createMattermostChannel(config: MattermostChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=mattermost.d.ts.map