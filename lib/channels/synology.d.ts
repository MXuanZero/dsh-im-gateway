/**
 * Synology Chat 渠道适配器：
 * - 发送：incoming webhook（POST { text }）
 * - 接收：outgoing webhook → 本地 HTTP server（用户把 Synology Chat 的
 *   outgoing webhook 指向本机公网地址）
 * @module dsh-im-gateway/channels/synology
 */
import type { ChannelAdapter } from '../core/types.js';
export interface SynologyChannelConfig {
    enabled?: boolean;
    /** incoming webhook URL（Synology Chat 集成里生成）。 */
    webhookUrl?: string;
    /** outgoing webhook 本地监听端口。 */
    port?: number;
}
export declare function createSynologyChannel(config: SynologyChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=synology.d.ts.map