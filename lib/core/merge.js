/**
 * 手机多段输入合并：用户在 IM 里长按输入会拆成多条短消息。
 * - 结尾 `..`：还有后续，先别提交
 * - 结尾 `!!`：说完了，立即提交
 * - 裸文本：进入 mergeTimeoutSecs 合并窗口，窗口内追加，超时提交
 * - 缓冲每次写入即快照落盘，进程崩溃重启后自动恢复并 flush
 * @module dsh-im-gateway/core/merge
 */
const CONTINUE_SUFFIX = '..';
const COMMIT_SUFFIX = '!!';
/** 去掉末尾的 `..` / `!!` 控制后缀。 */
export function stripControlSuffix(text) {
    if (text.endsWith(COMMIT_SUFFIX))
        return { text: text.slice(0, -COMMIT_SUFFIX.length), control: 'commit' };
    if (text.endsWith(CONTINUE_SUFFIX))
        return { text: text.slice(0, -CONTINUE_SUFFIX.length), control: 'continue' };
    return { text, control: 'none' };
}
export class SessionMerger {
    buffers = new Map();
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * 摄入一段文本。返回：
     * - `{ kind: 'buffered' }` — 已进合并窗口，等待后续
     * - `{ kind: 'flushed', text }` — 合并完成，应提交给 agent
     * - `{ kind: 'ignored' }` — 空白或纯控制符
     */
    ingest(key, raw) {
        const { text, control } = stripControlSuffix(raw);
        if (text.trim() === '' && control === 'none')
            return { kind: 'ignored' };
        if (control === 'continue') {
            // 追加进缓冲（若已有缓冲）；没有缓冲则直接开新缓冲
            const existing = this.buffers.get(key);
            const merged = existing ? `${existing.text}${text}` : text;
            this.setBuffer(key, merged);
            return { kind: 'buffered' };
        }
        const existing = this.buffers.get(key);
        if (existing) {
            this.clear(key);
            const merged = `${existing.text}${text}`;
            if (control === 'commit') {
                return { kind: 'flushed', text: merged };
            }
            // 有缓冲 + 裸文本：合并后直接提交（裸文本到达意味着用户已说完）
            return { kind: 'flushed', text: merged };
        }
        if (control === 'commit') {
            return { kind: 'flushed', text };
        }
        // 无缓冲 + 裸文本：开窗口，等待后续或超时
        this.setBuffer(key, text);
        return { kind: 'buffered' };
    }
    /** 恢复崩溃前的缓冲（last_update=now，超时后即提交）。 */
    restore(key, buffer) {
        this.setBuffer(key, buffer);
    }
    /** 立即提交某 key 的缓冲（如 /new 前），返回提交的文本。 */
    flush(key) {
        const entry = this.buffers.get(key);
        if (!entry)
            return undefined;
        this.clear(key);
        return entry.text;
    }
    /** 全部缓冲的快照（落盘用）。 */
    snapshots() {
        const out = {};
        for (const [key, entry] of this.buffers)
            out[key] = entry.text;
        return out;
    }
    dispose() {
        for (const key of [...this.buffers.keys()])
            this.clear(key);
    }
    setBuffer(key, text) {
        this.clear(key);
        const timer = setTimeout(() => {
            this.clear(key);
            void this.options.onFlush(key, text);
        }, this.options.mergeTimeoutMs);
        timer.unref?.();
        this.buffers.set(key, { text, timer });
        this.options.onSnapshot?.(key, text);
    }
    clear(key) {
        const entry = this.buffers.get(key);
        if (entry) {
            clearTimeout(entry.timer);
            this.buffers.delete(key);
        }
    }
}
//# sourceMappingURL=merge.js.map