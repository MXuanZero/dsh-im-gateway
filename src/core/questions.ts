import type { AskUserQuestionAnswer, AskUserQuestionAnswerItem, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'

export interface QuestionAnswerSource { channelId: string; chatId: string; label?: string }
export type QuestionWaitResult =
  | { kind: 'answered'; answer: AskUserQuestionAnswer; source: QuestionAnswerSource }
  | { kind: 'external'; answer: AskUserQuestionAnswer; source: 'web' }
  | { kind: 'timeout' }
  | { kind: 'cancelled' }
  | { kind: 'busy' }
export type QuestionAnswerAttempt =
  | { kind: 'answered'; answer: AskUserQuestionAnswer }
  | { kind: 'invalid'; message: string }
  | { kind: 'already-answered'; message: string }
  | { kind: 'not-pending' }

interface PendingQuestion {
  questions: AskUserQuestionItem[]
  resolve: (result: QuestionWaitResult) => void
  timer: NodeJS.Timeout
  signal?: AbortSignal
  onAbort?: () => void
}
interface RecentQuestion { questions: AskUserQuestionItem[]; message: string; expiresAt: number }

/** 同一会话只允许一个结构化问题等待；同步 claim 保证并发首答只有一个赢家。 */
export class QuestionBroker {
  private readonly pending = new Map<string, PendingQuestion>()
  private readonly recent = new Map<string, RecentQuestion>()

  hasPending(sessionId: string): boolean { return this.pending.has(sessionId) }
  questionsFor(sessionId: string): AskUserQuestionItem[] | undefined { return this.pending.get(sessionId)?.questions }

  wait(sessionId: string, questions: AskUserQuestionItem[], timeoutMs: number, signal?: AbortSignal): Promise<QuestionWaitResult> {
    this.pruneRecent()
    if (this.pending.has(sessionId)) return Promise.resolve({ kind: 'busy' })
    if (signal?.aborted) return Promise.resolve({ kind: 'cancelled' })
    return new Promise((resolve) => {
      const settle = (result: QuestionWaitResult): void => {
        const entry = this.pending.get(sessionId)
        if (!entry) return
        this.pending.delete(sessionId)
        clearTimeout(entry.timer)
        if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort)
        resolve(result)
      }
      const timer = setTimeout(() => settle({ kind: 'timeout' }), timeoutMs)
      timer.unref?.()
      const entry: PendingQuestion = { questions, resolve: settle, timer, ...(signal ? { signal } : {}) }
      if (signal) {
        entry.onAbort = () => settle({ kind: 'cancelled' })
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      this.pending.set(sessionId, entry)
    })
  }

  answer(sessionId: string, text: string, source: QuestionAnswerSource): QuestionAnswerAttempt {
    this.pruneRecent()
    const entry = this.pending.get(sessionId)
    if (!entry) {
      const recent = this.recent.get(sessionId)
      if (recent && looksLikeExplicitReply(recent.questions, text) && parseQuestionReply(recent.questions, text).ok) {
        return { kind: 'already-answered', message: recent.message }
      }
      return { kind: 'not-pending' }
    }
    const parsed = parseQuestionReply(entry.questions, text)
    if (!parsed.ok) return { kind: 'invalid', message: parsed.error }
    const summary = formatAnswerSummary(entry.questions, parsed.answer)
    this.remember(sessionId, entry.questions, `该提问已由 ${source.label ?? source.channelId} 回答：${summary}`)
    entry.resolve({ kind: 'answered', answer: parsed.answer, source })
    return { kind: 'answered', answer: parsed.answer }
  }

  finishFromWeb(sessionId: string, answer: AskUserQuestionAnswer): boolean {
    const entry = this.pending.get(sessionId)
    if (!entry) return false
    this.remember(sessionId, entry.questions, `该提问已在网页端回答：${formatAnswerSummary(entry.questions, answer)}`)
    entry.resolve({ kind: 'external', answer, source: 'web' })
    return true
  }

  cancel(sessionId: string): void { this.pending.get(sessionId)?.resolve({ kind: 'cancelled' }) }
  dispose(): void { for (const id of [...this.pending.keys()]) this.cancel(id); this.recent.clear() }
  private remember(id: string, questions: AskUserQuestionItem[], message: string): void {
    this.recent.set(id, { questions, message, expiresAt: Date.now() + 30_000 })
  }
  private pruneRecent(): void {
    const now = Date.now()
    for (const [id, item] of this.recent) if (item.expiresAt <= now) this.recent.delete(id)
  }
}

export function formatQuestionPrompt(questions: AskUserQuestionItem[], timeoutSecs: number): string {
  const lines = [`❓ 需要你的选择（${timeoutSecs}s 内可在网页或任一绑定渠道回答，第一答生效）`, '']
  questions.forEach((question, index) => {
    lines.push(`${question.header ? `【${question.header}】` : `问题 ${index + 1}`} ${question.question}`)
    if (question.detail) lines.push(question.detail)
    for (const [i, option] of (question.options ?? []).entries()) lines.push(`${i + 1}) ${option.label}${option.description ? ` — ${option.description}` : ''}`)
    if (question.multiSelect === true) lines.push('（可多选，用逗号分隔，如 1,3）')
    else if ((question.options?.length ?? 0) === 0) lines.push('（直接回复你的答案）')
    lines.push('')
  })
  if (questions.length === 1) lines.push('回复选项编号/文字；也可以直接回复自定义答案。')
  else lines.push('请每行回答一个问题，格式为「问题序号: 答案」，例如：', '1: 2', '2: 1,3')
  return lines.join('\n').trim()
}

export function formatAnswerSummary(questions: AskUserQuestionItem[], answer: AskUserQuestionAnswer): string {
  return answer.answers.map((item) => {
    const question = questions.find((candidate) => candidate.id === item.id)
    const value = [...item.selected, ...(item.custom ? [item.custom] : [])].join('、') || '（空）'
    return questions.length === 1 ? value : `${question?.header ?? question?.question ?? item.id}=${value}`
  }).join('；')
}

export function parseQuestionReply(questions: AskUserQuestionItem[], rawText: string):
  { ok: true; answer: AskUserQuestionAnswer } | { ok: false; error: string } {
  const text = rawText.trim()
  if (text === '') return { ok: false, error: '答案不能为空。' }
  if (questions.length === 1) {
    const parsed = parseOne(questions[0]!, text)
    return parsed.ok ? { ok: true, answer: { answers: [parsed.answer] } } : parsed
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const values = new Map<number, string>()
  for (const line of lines) {
    const match = line.match(/^(\d+)\s*[:：=]\s*(.+)$/)
    if (!match) continue
    const index = Number(match[1]) - 1
    if (index >= 0 && index < questions.length) values.set(index, match[2]!.trim())
  }
  if (values.size === 0 && lines.length === questions.length) lines.forEach((line, index) => values.set(index, line))
  if (values.size !== questions.length) return { ok: false, error: `请回答全部 ${questions.length} 个问题，每行使用「问题序号: 答案」，例如「1: 2」。` }
  const answers: AskUserQuestionAnswerItem[] = []
  for (let index = 0; index < questions.length; index += 1) {
    const parsed = parseOne(questions[index]!, values.get(index)!)
    if (!parsed.ok) return { ok: false, error: `问题 ${index + 1}：${parsed.error}` }
    answers.push(parsed.answer)
  }
  return { ok: true, answer: { answers } }
}

function looksLikeExplicitReply(questions: AskUserQuestionItem[], rawText: string): boolean {
  const text = rawText.trim()
  if (questions.length > 1) return text.split(/\r?\n/).some((line) => /^\s*\d+\s*[:：=]/.test(line))
  const question = questions[0]
  const options = question?.options ?? []
  if (options.length === 0) return false
  const tokens = question?.multiSelect === true
    ? text.split(/[,，、;；]+/).map((token) => token.trim()).filter(Boolean)
    : [text]
  return tokens.length > 0 && tokens.every((token) => {
    const index = /^\d+$/.test(token) ? Number(token) : NaN
    return (Number.isInteger(index) && index >= 1 && index <= options.length)
      || options.some((option) => option.label.toLocaleLowerCase() === token.toLocaleLowerCase())
  })
}

function parseOne(question: AskUserQuestionItem, text: string):
  { ok: true; answer: AskUserQuestionAnswerItem } | { ok: false; error: string } {
  const value = text.trim()
  if (value === '') return { ok: false, error: '答案不能为空。' }
  const options = question.options ?? []
  if (options.length === 0) return { ok: true, answer: { id: question.id, selected: [], custom: value } }
  const labelAt = (token: string): string | undefined => {
    const numeric = token.match(/^\d+$/) ? Number(token) : NaN
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) return options[numeric - 1]!.label
    return options.find((option) => option.label.toLocaleLowerCase() === token.toLocaleLowerCase())?.label
  }
  if (question.multiSelect !== true) {
    const label = labelAt(value)
    return label ? { ok: true, answer: { id: question.id, selected: [label] } } : { ok: true, answer: { id: question.id, selected: [], custom: value } }
  }
  const tokens = value.split(/[,，、;；]+/).map((token) => token.trim()).filter(Boolean)
  const selected: string[] = []
  const custom: string[] = []
  for (const token of tokens) {
    const label = labelAt(token)
    if (label) { if (!selected.includes(label)) selected.push(label) } else custom.push(token)
  }
  return { ok: true, answer: { id: question.id, selected, ...(custom.length ? { custom: custom.join('，') } : {}) } }
}
