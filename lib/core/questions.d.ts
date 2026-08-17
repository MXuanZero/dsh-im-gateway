import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions';
export interface QuestionAnswerSource {
    channelId: string;
    chatId: string;
    label?: string;
}
export type QuestionWaitResult = {
    kind: 'answered';
    answer: AskUserQuestionAnswer;
    source: QuestionAnswerSource;
} | {
    kind: 'external';
    answer: AskUserQuestionAnswer;
    source: 'web';
} | {
    kind: 'timeout';
} | {
    kind: 'cancelled';
} | {
    kind: 'busy';
};
export type QuestionAnswerAttempt = {
    kind: 'answered';
    answer: AskUserQuestionAnswer;
} | {
    kind: 'invalid';
    message: string;
} | {
    kind: 'already-answered';
    message: string;
} | {
    kind: 'not-pending';
};
/** 同一会话只允许一个结构化问题等待；同步 claim 保证并发首答只有一个赢家。 */
export declare class QuestionBroker {
    private readonly pending;
    private readonly recent;
    hasPending(sessionId: string): boolean;
    questionsFor(sessionId: string): AskUserQuestionItem[] | undefined;
    wait(sessionId: string, questions: AskUserQuestionItem[], timeoutMs: number, signal?: AbortSignal): Promise<QuestionWaitResult>;
    answer(sessionId: string, text: string, source: QuestionAnswerSource): QuestionAnswerAttempt;
    finishFromWeb(sessionId: string, answer: AskUserQuestionAnswer): boolean;
    cancel(sessionId: string): void;
    dispose(): void;
    private remember;
    private pruneRecent;
}
export declare function formatQuestionPrompt(questions: AskUserQuestionItem[], timeoutSecs: number): string;
export declare function formatAnswerSummary(questions: AskUserQuestionItem[], answer: AskUserQuestionAnswer): string;
export declare function parseQuestionReply(questions: AskUserQuestionItem[], rawText: string): {
    ok: true;
    answer: AskUserQuestionAnswer;
} | {
    ok: false;
    error: string;
};
//# sourceMappingURL=questions.d.ts.map