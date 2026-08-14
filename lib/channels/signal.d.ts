/**
 * Signal 渠道适配器：通过 signal-cli（外部进程）收发，零 npm 依赖。
 * 需要用户自行安装 signal-cli 并注册号码。
 * @module dsh-im-gateway/channels/signal
 */
import type { ChannelAdapter } from '../core/types.js';
export interface SignalChannelConfig {
    enabled?: boolean;
    /** signal-cli 可执行文件路径（默认 signal-cli）。 */
    cli?: string;
    /** 已注册的本地号码（+8613800000000）。 */
    phone?: string;
    /** 轮询间隔（秒）。 */
    pollIntervalSec?: number;
}
export declare function createSignalChannel(config: SignalChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=signal.d.ts.map