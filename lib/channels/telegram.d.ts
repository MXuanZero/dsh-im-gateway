/**
 * Telegram 渠道适配器：Bot API 长轮询，零第三方依赖（纯 fetch）。
 * 每聊天一个 agent 会话由网关统一管理；本适配器只负责收/发。
 * @module dsh-im-gateway/channels/telegram
 */
import type { ChannelAdapter } from '../core/types.js';
export interface TelegramChannelConfig {
    enabled?: boolean;
    /** @BotFather 的 bot token；缺省回退 DSH_TELEGRAM_TOKEN 环境变量。 */
    token?: string;
    /** 允许私聊的用户 id（字符串化）；空 = 仅 allowAllUsers 时放行。 */
    allowedUserIds?: string[];
    pollingTimeoutSec?: number;
}
export declare function createTelegramChannel(config: TelegramChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=telegram.d.ts.map