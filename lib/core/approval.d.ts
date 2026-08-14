/**
 * 审批应答经纪：IM 里的「批准 / 拒绝」→ approval/request waterfall 的等待结果。
 * 支持多 pending（不同会话可并发审批），按 pending key 路由。
 * @module dsh-im-gateway/core/approval
 */
export type ApprovalVerdict = 'allow' | 'reject' | undefined;
export declare class ApprovalBroker {
    private readonly pending;
    get size(): number;
    hasPending(key: string): boolean;
    /**
     * 挂起一个批准请求，等待 IM 答复。
     * 同 key 已有 pending 时立即返回 undefined（不排队，直接委托下游 answerer）。
     * signal 中止（提问方撤回）也返回 undefined。
     */
    wait(key: string, timeoutMs: number, signal?: AbortSignal): Promise<ApprovalVerdict>;
    /** IM 侧答复。没有 pending 返回 false。 */
    answer(key: string, allow: boolean): boolean;
    dispose(): void;
}
//# sourceMappingURL=approval.d.ts.map