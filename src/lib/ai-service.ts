/**
 * AI 어시스턴트 호출 (폐쇄망 운영 정책: 비활성화).
 *
 * 외부 LLM API(Lovable, OpenAI 등) 의존 → 폐쇄망에서 사용 불가.
 * 모든 호출은 명시적으로 throw하여 호출자가 fallback 분기를 타도록 한다.
 *
 * 향후 내부 LLM(Ollama 등)을 부서 서버에 띄울 경우, 이 모듈을
 * 다시 활성화하여 callAI를 fetch("/api/ai", ...) 등으로 교체.
 */
export type AITask = 'classify_complaint' | 'draft_response' | 'summarize_report' | 'predict_demand' | 'analyze_revenue';

interface CallAIParams {
  task: AITask;
  input: Record<string, any>;
  context?: string;
}

interface AIResult {
  result?: string;
  confidence?: number;
  [key: string]: any;
}

export const AI_DISABLED_MESSAGE =
  'AI 어시스턴트는 현재 폐쇄망 운영 환경에서 비활성화되어 있습니다. 수동으로 처리해주세요.';

export async function callAI(_params: CallAIParams): Promise<AIResult> {
  throw new Error(AI_DISABLED_MESSAGE);
}

/** 호출자가 가용 여부를 확인할 수 있도록 헬퍼 노출 */
export function isAIEnabled(): boolean {
  return false;
}
