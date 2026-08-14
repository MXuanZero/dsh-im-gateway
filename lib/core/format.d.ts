/**
 * Markdown → 渠道文本的保守转换。
 * - `toPlainText`：去掉围栏/行内代码标记、粗体斜体星号，保留可读结构
 * - `toTelegramHtml`：围栏代码 → <pre>、行内代码 → <code>、粗体 → <b>，
 *   其余 HTML 转义（Telegram HTML 模式）
 * @module dsh-im-gateway/core/format
 */
/** 去掉 markdown 标记，保留文本内容。 */
export declare function toPlainText(markdown: string): string;
/** Telegram HTML 模式转换（保守子集；实体非法时调用方回退纯文本）。 */
export declare function toTelegramHtml(markdown: string): string;
//# sourceMappingURL=format.d.ts.map