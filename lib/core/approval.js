/**
 * 审批应答经纪：IM 里的「批准 / 拒绝」→ approval/request waterfall 的等待结果。
 * 支持多 pending（不同会话可并发审批），按 pending key 路由。
 * @module dsh-im-gateway/core/approval
 */
export class ApprovalBroker {
    pending = new Map();
    get size() {
        return this.pending.size;
    }
    hasPending(key) {
        return this.pending.has(key);
    }
    /**
     * 挂起一个批准请求，等待 IM 答复。
     * 同 key 已有 pending 时立即返回 undefined（不排队，直接委托下游 answerer）。
     * signal 中止（提问方撤回）也返回 undefined。
     */
    wait(key, timeoutMs, signal) {
        if (this.pending.has(key))
            return Promise.resolve(undefined);
        return new Promise((resolve) => {
            const settle = (v) => {
                const entry = this.pending.get(key);
                if (!entry)
                    return;
                clearTimeout(entry.timer);
                this.pending.delete(key);
                resolve(v);
            };
            const timer = setTimeout(() => settle(undefined), timeoutMs);
            timer.unref?.();
            this.pending.set(key, { resolve: settle, timer });
            signal?.addEventListener('abort', () => settle(undefined), { once: true });
        });
    }
    /** IM 侧答复。没有 pending 返回 false。 */
    answer(key, allow) {
        const entry = this.pending.get(key);
        if (!entry)
            return false;
        entry.resolve(allow ? 'allow' : 'reject');
        return true;
    }
    dispose() {
        for (const key of [...this.pending.keys()]) {
            const entry = this.pending.get(key);
            // 直接 resolve：settle 内部会清理 pending 表（先 resolve 后 delete，顺序敏感）
            if (entry)
                entry.resolve(undefined);
        }
    }
}
//# sourceMappingURL=approval.js.map