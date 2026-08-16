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
import type { ChannelAdapter, ImGatewayConfig, ImMessage } from './types.js';
export interface GatewayOptions {
    config: ImGatewayConfig;
    /** 登录状态落盘目录（扫码链接等）。 */
    stateDir: string;
    log: (line: string) => void;
    /** 未授权用户触达时回调（如登记待授权请求）。返回给用户的提示文案（默认引导去设置批准）。 */
    onUnauthorized?: (channelId: string, msg: ImMessage) => string;
    /** 每聊天工作区偏好的持久化（/workspace 命令）。 */
    workspaceStore?: {
        load(): Array<[string, string]>;
        save(entries: Array<[string, string]>): void;
    };
}
export declare class ImGateway {
    private readonly ctx;
    private readonly config;
    private readonly stateDir;
    private readonly logLine;
    /** 工作区偏好持久化（/workspace 命令）。 */
    private readonly workspaceStore;
    private readonly channels;
    private readonly router;
    private readonly broker;
    private readonly merger;
    private readonly mergeBuffers;
    private readonly disposeEvents;
    private readonly disposeTools;
    /** 未授权回调（manager 登记待授权请求用）；options.onUnauthorized 兜底。 */
    private unauthorizedHandler;
    /** UI 批准的渠道白名单（manager 同步），重启后由 manager 重新灌入。 */
    private readonly extraAllowlist;
    constructor(ctx: Context, options: GatewayOptions);
    register(channel: ChannelAdapter): void;
    unregister(channelId: string): void;
    channel(channelId: string): ChannelAdapter | undefined;
    listChannels(): ChannelAdapter[];
    /** 设置未授权回调（manager 构造后接线用）。 */
    setUnauthorizedHandler(handler: (channelId: string, msg: ImMessage) => string): void;
    /** 添加 UI 批准的渠道白名单用户（manager 同步调用；重启后重新灌入）。 */
    addAuthorizedUser(channelId: string, userId: string): void;
    private handleInbound;
    /** 把媒体消息组装成 content blocks（图片走 attachments → image block；文件/视频注明路径）。 */
    private buildMediaBlocks;
    /** 把文本注入目标 chat 的 agent 会话，返回给用户的可选回执。 */
    private injectText;
    /** 把 content blocks 注入目标 chat 的 agent 会话，返回给用户的可选回执。 */
    private injectBlocks;
    private ackFor;
    /** 注册 im_send_file 工具：agent 把工作区文件发给当前 IM 聊天。 */
    private registerSendMediaTool;
    /** 把文件发送到会话关联的所有渠道（im_send_file 工具的执行体，可测试）。 */
    sendFileToChats(filePath: string, caption?: string, channelFilter?: string, sessionId?: string): Promise<{
        ok: boolean;
        detail: string;
    }>;
    private authorized;
    private handleCommand;
    /** 持久化每聊天工作区偏好。 */
    private persistWorkspaces;
    /** 列出所有工作区（按会话数排序）。 */
    private listWorkspaces;
    /** 列出会话（可按工作区过滤）。 */
    private listSessions;
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