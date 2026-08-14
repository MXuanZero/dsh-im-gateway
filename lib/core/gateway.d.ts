/**
 * 聚合网关主服务：统一 IM 渠道的注册、会话路由、命令、审批桥与出站投递。
 *
 * 数据流：
 * - 入站：渠道 adapter → authorize → 命令? → merge → router 定位会话 → followup
 * - 出站：session/event（assistant/message）→ 按 sessionId 路由回渠道 → 分片 send
 * - 审批：approval/request waterfall → 推送到会话所在 chat → 回复「批准/拒绝」→ 返回 verdict
 * @module dsh-im-gateway/core/gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import { type MergeResult } from './merge.js';
import type { ChannelAdapter, ImGatewayConfig } from './types.js';
export interface GatewayOptions {
    config: ImGatewayConfig;
    /** 登录状态落盘目录（扫码链接等）。 */
    stateDir: string;
    log: (line: string) => void;
}
export declare class ImGateway {
    private readonly ctx;
    private readonly config;
    private readonly stateDir;
    private readonly logLine;
    private readonly channels;
    private readonly router;
    private readonly broker;
    private readonly merger;
    private readonly mergeBuffers;
    private readonly disposeEvents;
    constructor(ctx: Context, options: GatewayOptions);
    register(channel: ChannelAdapter): void;
    unregister(channelId: string): void;
    channel(channelId: string): ChannelAdapter | undefined;
    listChannels(): ChannelAdapter[];
    private handleInbound;
    /** 把文本注入目标 chat 的 agent 会话，返回给用户的可选回执。 */
    private injectText;
    private userMessage;
    private authorized;
    private handleCommand;
    private handleApprovalRequest;
    private answerApproval;
    private handleSessionEvent;
    private deliver;
    dispose(): void;
    stopAgents(): Promise<void>;
}
/** 消息合并结果类型再导出（供渠道层无感知使用）。 */
export type { MergeResult };
//# sourceMappingURL=gateway.d.ts.map