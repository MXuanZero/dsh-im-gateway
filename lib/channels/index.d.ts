/**
 * 渠道注册表：把配置对象映射为各渠道 adapter 实例。
 * 每个 factory 在凭据缺失/未启用时返回 undefined（不启动）。
 * @module dsh-im-gateway/channels
 */
import type { ChannelAdapter, ImGatewayConfig } from '../core/types.js';
import { createTelegramChannel } from './telegram.js';
import { createDiscordChannel } from './discord.js';
import { createSlackChannel } from './slack.js';
import { createFeishuChannel } from './feishu.js';
import { createWechatChannel } from './wechat.js';
export type ChannelLog = (line: string) => void;
/** 创建全部已配置渠道。stateDir 供扫码/状态类渠道落盘。 */
export declare function createChannels(config: ImGatewayConfig, log: ChannelLog, stateDir: string): ChannelAdapter[];
export { createTelegramChannel, createDiscordChannel, createSlackChannel, createFeishuChannel, createWechatChannel };
//# sourceMappingURL=index.d.ts.map