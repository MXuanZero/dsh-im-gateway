/**
 * Matrix 渠道适配器：Matrix 客户端同步（/_matrix/client/v3/sync 长轮询），
 * 零第三方依赖。支持私聊与房间（m.room.message / m.text）。
 * @module dsh-im-gateway/channels/matrix
 */
import type { ChannelAdapter } from '../core/types.js';
export interface MatrixChannelConfig {
    enabled?: boolean;
    /** 例如 https://matrix.org。 */
    homeserver?: string;
    /** 完整用户 id，例如 @bot:matrix.org。 */
    userId?: string;
    /** access token（用户或 bot 账号）。 */
    accessToken?: string;
}
export declare function createMatrixChannel(config: MatrixChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=matrix.d.ts.map