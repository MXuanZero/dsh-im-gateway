/**
 * Slack 渠道适配器：Socket Mode（app-level token 建 WebSocket）+ Web API，
 * 零第三方依赖（原生 WebSocket + fetch）。需要接收 ack（envelope_id）。
 * @module dsh-im-gateway/channels/slack
 */
import type { ChannelAdapter } from '../core/types.js';
export interface SlackChannelConfig {
    enabled?: boolean;
    /** Bot token（xoxb-…）；缺省回退 DSH_SLACK_TOKEN。 */
    token?: string;
    /** App-level token（xapp-…）；缺省回退 DSH_SLACK_APP_TOKEN。 */
    appToken?: string;
}
export declare function createSlackChannel(config: SlackChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=slack.d.ts.map