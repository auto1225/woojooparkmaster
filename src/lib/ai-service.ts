/**
 * AI 어시스턴트 호출 (자체 백엔드 /api/ai/* 사용).
 *
 * 백엔드 .env의 AI_BASE_URL 이 설정된 경우만 실제 LLM 호출.
 * 비어있으면 503 응답 → 호출자 (try/catch) 가 안내 메시지만 표시.
 *
 * 운영 시나리오:
 *   1) 폐쇄망 정책상 외부 API 차단
 *   2) 부서 서버 PC에 Ollama 설치 (qwen2.5:7b 등)
 *   3) api/.env 에 AI_BASE_URL=http://localhost:11434 설정
 *   4) 백엔드 재시작 → AI 기능 활성화
 */
import { aiApi } from "@/integrations/api/ai";

export type AITask = "classify_complaint" | "draft_response" | "summarize_report" | "predict_demand" | "analyze_revenue";

interface CallAIParams {
  task: AITask;
  input: Record<string, unknown>;
  context?: string;
}

interface AIResult {
  result?: string;
  category?: string;
  sub_category?: string;
  priority?: string;
  assigned_team?: string;
  summary?: string;
  keywords?: string[];
  [key: string]: unknown;
}

export const AI_DISABLED_MESSAGE =
  "AI 어시스턴트가 비활성 상태입니다. 부서 서버에 LLM 설치 후 .env의 AI_BASE_URL을 설정하세요.";

export async function callAI(params: CallAIParams): Promise<AIResult> {
  return aiApi.task(params);
}

/** 호출자가 활성 여부를 미리 확인 (UI에서 버튼 disabled 처리 등) */
let cachedEnabled: boolean | null = null;
export async function isAIEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    const h = await aiApi.health();
    cachedEnabled = h.enabled;
    return h.enabled;
  } catch {
    cachedEnabled = false;
    return false;
  }
}

/** 캐시 무효화 (AI 설정 변경 후 호출) */
export function resetAIEnabledCache() {
  cachedEnabled = null;
}
