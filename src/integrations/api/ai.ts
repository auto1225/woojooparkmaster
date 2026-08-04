/**
 * AI 어시스턴트 typed binding (자체 백엔드 /api/ai/* 사용).
 *
 * 백엔드 ai.ts 라우트와 1:1 대응. 백엔드의 .env에 AI_BASE_URL 설정되어 있으면
 * Ollama 등 내부 LLM으로 라우팅; 비어있으면 503 응답.
 *
 * 호출 사이트(ComplaintNew, ComplaintDetail, ReportGenerate)는 모두 try/catch로
 * 감싸있어 503 응답 시 안내 메시지만 보여줌.
 */
import { apiClient, ApiError } from "./client";

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

export const aiApi = {
  /** AI 활성 여부 + 모델 정보 */
  health: () =>
    apiClient.get<{ enabled: boolean; base_url: string | null; model: string; provider: string }>("/api/ai/health"),

  /** 명명된 task 호출 */
  task: (params: CallAIParams) => apiClient.post<AIResult>("/api/ai/task", params),

  /** 자유 chat */
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, format?: "text" | "json") =>
    apiClient.post<{ result: string }>("/api/ai/chat", { messages, format }),
};

export { ApiError };
