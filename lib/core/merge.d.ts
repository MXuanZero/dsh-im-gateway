/**
 * 手机多段输入合并：用户在 IM 里长按输入会拆成多条短消息。
 * - 结尾 `..`：还有后续，先别提交
 * - 结尾 `!!`：说完了，立即提交
 * - 裸文本：进入 mergeTimeoutSecs 合并窗口，窗口内追加，超时提交
 * - 缓冲每次写入即快照落盘，进程崩溃重启后自动恢复并 flush
 * @module dsh-im-gateway/core/merge
 */
export interface MergerOptions {
    mergeTimeoutMs: number;
    onSnapshot?: (key: string, buffer: string) => void;
    onFlush: (key: string, text: string) => void | Promise<void>;
}
export interface MergeResult {
    kind: 'buffered' | 'flushed' | 'ignored';
    text?: string;
}
/** 去掉末尾的 `..` / `!!` 控制后缀。 */
export declare function stripControlSuffix(text: string): {
    text: string;
    control: 'continue' | 'commit' | 'none';
};
export declare class SessionMerger {
    private readonly buffers;
    private readonly options;
    constructor(options: MergerOptions);
    /**
     * 摄入一段文本。返回：
     * - `{ kind: 'buffered' }` — 已进合并窗口，等待后续
     * - `{ kind: 'flushed', text }` — 合并完成，应提交给 agent
     * - `{ kind: 'ignored' }` — 空白或纯控制符
     */
    ingest(key: string, raw: string): MergeResult;
    /** 恢复崩溃前的缓冲（last_update=now，超时后即提交）。 */
    restore(key: string, buffer: string): void;
    /** 立即提交某 key 的缓冲（如 /new 前），返回提交的文本。 */
    flush(key: string): string | undefined;
    /** 全部缓冲的快照（落盘用）。 */
    snapshots(): Record<string, string>;
    dispose(): void;
    private setBuffer;
    private clear;
}
//# sourceMappingURL=merge.d.ts.map