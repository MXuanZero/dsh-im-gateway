/**
 * 长文本分片：按渠道单条上限切分，优先在换行/中文句号/句点处断行，
 * 分段前缀 `（i/n）` 的字符数参与递归收敛（不会出现「第 3/2 段」）。
 * @module dsh-im-gateway/core/split
 */
export interface SplitOptions {
    /** 单条上限（Unicode 码点）。 */
    max: number;
    /** 是否加分段前缀（默认 true）。 */
    prefix?: boolean;
}
/**
 * 把文本切分为不超过 max 码点的片段序列。
 * 断点优先级：换行 → 中文句号（。！？…）→ 英文句点+空格 → 硬切。
 */
export declare function splitText(text: string, max: number): string[];
//# sourceMappingURL=split.d.ts.map