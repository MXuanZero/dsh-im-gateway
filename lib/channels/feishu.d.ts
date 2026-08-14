/**
 * 飞书 / Lark 渠道适配器：官方 Node SDK 的 WebSocket 长连接 + IM API。
 * SDK（@larksuiteoapi/node-sdk）为可选依赖，动态 import；
 * 未安装时给出安装提示。默认模式：WebSocket 长连接（无需公网 URL）。
 * @module dsh-im-gateway/channels/feishu
 */
import type { ChannelAdapter } from '../core/types.js';
export interface FeishuChannelConfig {
    enabled?: boolean;
    /** 飞书开放平台应用的 App ID；缺省回退 DSH_FEISHU_APP_ID。 */
    appId?: string;
    /** App Secret；缺省回退 DSH_FEISHU_APP_SECRET。 */
    appSecret?: string;
}
export declare function createFeishuChannel(config: FeishuChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=feishu.d.ts.map