/**
 * 长文本分片：按渠道单条上限切分，优先在换行/中文句号/句点处断行，
 * 分段前缀 `（i/n）` 的字符数参与递归收敛（不会出现「第 3/2 段」）。
 * @module dsh-im-gateway/core/split
 */

export interface SplitOptions {
  /** 单条上限（Unicode 码点）。 */
  max: number
  /** 是否加分段前缀（默认 true）。 */
  prefix?: boolean
}

const PREFIX_RE = /^（\d+\/\d+）/

/**
 * 计算带前缀的段文本；前缀长度递归收敛进上限。
 */
function withPrefix(index: number, total: number, text: string, max: number): string {
  const prefix = total <= 1 ? '' : `（${index}/${total}）`
  if (prefix.length >= max) return text
  const budget = max - prefix.length
  const body = [...text].slice(0, budget).join('')
  return prefix + body
}

/**
 * 把文本切分为不超过 max 码点的片段序列。
 * 断点优先级：换行 → 中文句号（。！？…）→ 英文句点+空格 → 硬切。
 */
export function splitText(text: string, max: number): string[] {
  if (max <= 0) return text === '' ? [] : [text]
  const chars = [...text]
  if (chars.length === 0) return []
  if (chars.length <= max) return [text]

  const parts: string[] = []
  let rest = chars
  let index = 1
  let total = Math.ceil(chars.length / max) // 初步估计，用于前缀
  while (rest.length > 0) {
    const budget = max - (total <= 1 ? 0 : `（${index}/${total}）`.length)
    if (budget <= 0) {
      // 前缀本身超限：退化到无前缀硬切
      parts.push(rest.slice(0, max).join(''))
      rest = rest.slice(max)
      index += 1
      continue
    }
    const window = rest.slice(0, budget)
    const cut = findBreak(window)
    const piece = rest.slice(0, cut === 0 ? budget : cut).join('')
    if (piece.length > 0) {
      parts.push(withPrefix(index, total, piece, max))
      rest = rest.slice(piece.length)
      index += 1
    } else {
      // 无法推进（理论上不会发生）：硬切兜底
      parts.push(withPrefix(index, total, window.join(''), max))
      rest = rest.slice(window.length)
      index += 1
    }
  }
  // 前缀估计可能偏差（比如第 1 段就是长词），实际段数可能 != total。
  // 重新按真实段数再算一次前缀（两遍法，保证（i/n）准确）。
  if (parts.length !== total && parts.length > 1) {
    return rePrefix(parts, max)
  }
  return parts
}

/** 在窗口内找最优断点，返回断点前的长度；0 = 无自然断点。 */
function findBreak(window: string[]): number {
  // 从后往前找换行
  for (let i = window.length - 1; i >= 0; i -= 1) {
    if (window[i] === '\n') return i + 1
  }
  // 中文句号/问号/感叹号/省略号
  for (let i = window.length - 1; i >= 0; i -= 1) {
    if ('。！？…；'.includes(window[i] ?? '')) return i + 1
  }
  // 英文句点+空格、逗号+空格
  for (let i = window.length - 2; i >= 0; i -= 1) {
    if (window[i] === '.' && window[i + 1] === ' ') return i + 1
    if (window[i] === ',' && window[i + 1] === ' ') return i + 1
  }
  return 0
}

/** 按真实段数重算前缀。 */
function rePrefix(parts: string[], max: number): string[] {
  const total = parts.length
  return parts.map((raw, i) => {
    const index = i + 1
    const prefix = `（${index}/${total}）`
    const body = [...raw].join('')
    if (body.startsWith('（') && PREFIX_RE.test(body.slice(0, 12))) {
      // 去掉旧前缀
      const m = body.match(PREFIX_RE)
      if (m) return prefix + [...body.slice(m[0].length)].slice(0, max - prefix.length).join('')
    }
    return prefix + [...body].slice(0, max - prefix.length).join('')
  })
}
