/**
 * WhatsApp 渠道适配器：基于 @whiskeysockets/baileys（可选依赖，动态 import）。
 * 需要扫码配对（配对码写入状态目录 whatsaapp-pairing.txt 并在日志输出）。
 * @module dsh-im-gateway/channels/whatsapp
 */
import type { ChannelAdapter } from '../core/types.js';
export interface WhatsAppChannelConfig {
    enabled?: boolean;
    stateDir?: string;
}
export declare function createWhatsAppChannel(config: WhatsAppChannelConfig, log: (line: string) => void, stateDir: string): ChannelAdapter | undefined;
//# sourceMappingURL=whatsapp.d.ts.map