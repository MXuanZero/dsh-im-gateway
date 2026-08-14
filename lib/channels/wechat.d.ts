/**
 * 微信渠道适配器：通过腾讯非官方 iLink 网关（ilinkai.weixin.qq.com）接入个人微信。
 * 协议移植自 hermes-agent / AMClaw 同源实现（与 OpenClaw 微信插件同一机制）：
 * 扫码登录 → 长轮询收消息 → context_token 回复。
 *
 * ⚠️ 非官方通道：仅私聊、一个账号一个 poller，建议使用专用小号，有被限制风险。
 * @module dsh-im-gateway/channels/wechat
 */
import type { ChannelAdapter } from '../core/types.js';
export interface WechatChannelConfig {
    enabled?: boolean;
    /** 登录/上下文状态落盘目录。 */
    stateDir?: string;
    pollTimeoutSecs?: number;
}
export declare function createWechatChannel(config: WechatChannelConfig, log: (line: string) => void, stateDir: string): ChannelAdapter | undefined;
//# sourceMappingURL=wechat.d.ts.map