/**
 * iMessage 渠道适配器（macOS only，实验性）：
 * - 发送：AppleScript osascript（零依赖）
 * - 接收：优先使用 imsg 桥（`imsg listen`），未配置时仅发送。
 * @module dsh-im-gateway/channels/imessage
 */
import type { ChannelAdapter } from '../core/types.js';
export interface IMessageChannelConfig {
    enabled?: boolean;
    /** imsg 桥可执行文件（OpenClaw 同款），可选。 */
    imsgPath?: string;
}
export declare function createIMessageChannel(config: IMessageChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=imessage.d.ts.map