/**
 * AI 어시스턴트 라우트 (Ollama 또는 호환 LLM 서버 대상).
 *
 * 폐쇄망 운영 정책:
 *   - 외부 LLM API (OpenAI, Lovable 등) 호출 금지
 *   - 내부 LLM 서버를 부서 PC에 설치한 경우 활성화 가능
 *   - .env의 AI_BASE_URL 이 비어있으면 503 응답 (비활성)
 *
 * 지원하는 LLM 서버:
 *   - Ollama (http://localhost:11434/api/chat)
 *   - llama.cpp server (OpenAI 호환 API)
 *   - vLLM 등 OpenAI 호환 엔드포인트
 *
 * .env 추가 변수:
 *   AI_BASE_URL=http://localhost:11434     # 비어있으면 비활성
 *   AI_MODEL=qwen2.5:7b                    # 기본 모델
 *   AI_PROVIDER=ollama                     # ollama | openai-compatible
 *
 * 엔드포인트:
 *   POST /api/ai/chat       프롬프트로 자유 호출
 *   POST /api/ai/task       명명된 task (classify_complaint, draft_response 등)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recordAudit } from "../lib/crud-helpers.js";
import { ApiError } from "../lib/pg-errors.js";

const AI_BASE_URL = process.env.AI_BASE_URL ?? "";
const AI_MODEL = process.env.AI_MODEL ?? "qwen2.5:7b";
const AI_PROVIDER = (process.env.AI_PROVIDER ?? "ollama") as "ollama" | "openai-compatible";

const TASK_PROMPTS: Record<string, string> = {
  classify_complaint: `당신은 공영주차장 민원 분류 전문가입니다.
민원 내용을 분석하여 다음을 JSON으로 반환하세요:
{
  "category": "fee|facility|operation|enforcement_appeal|noise|safety|cleanliness|guidance|suggestion|other",
  "sub_category": "세부 분류",
  "priority": "low|normal|high|urgent",
  "assigned_team": "operations|facilities",
  "summary": "민원 요약 1문장",
  "keywords": ["키워드1", "키워드2"]
}
반드시 유효한 JSON만 반환하세요.`,
  draft_response: `당신은 공영주차장 민원 회신 담당 공무원입니다.
정중하고 공식적인 어조로 민원 회신을 작성하세요.
- 민원인의 불편에 공감 표현
- 조치 내용 또는 계획 설명
- 추가 문의 안내
200자 내외로 작성하세요.`,
  summarize_report: `당신은 공영주차장 운영 분석 전문가입니다.
주어진 데이터를 바탕으로 핵심 인사이트와 권고사항을 요약 작성하세요.`,
};

const ChatBody = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  })),
  format: z.enum(["text", "json"]).optional(),
});

const TaskBody = z.object({
  task: z.enum(["classify_complaint", "draft_response", "summarize_report", "predict_demand", "analyze_revenue"]),
  input: z.record(z.unknown()),
  context: z.string().optional(),
});

/** Ollama / OpenAI 호환 LLM 호출. */
async function callLLM(messages: Array<{ role: string; content: string }>, format?: "text" | "json"): Promise<string> {
  if (!AI_BASE_URL) {
    throw new ApiError(503, "AI 어시스턴트가 비활성 상태입니다. .env의 AI_BASE_URL을 설정하세요.");
  }

  if (AI_PROVIDER === "ollama") {
    const r = await fetch(`${AI_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        stream: false,
        format: format === "json" ? "json" : undefined,
      }),
    });
    if (!r.ok) throw new ApiError(502, `LLM 서버 응답 오류: HTTP ${r.status}`);
    const data = await r.json() as { message?: { content?: string } };
    return data.message?.content ?? "";
  }

  // OpenAI 호환 (llama.cpp server, vLLM 등)
  const r = await fetch(`${AI_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer dummy",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      response_format: format === "json" ? { type: "json_object" } : undefined,
    }),
  });
  if (!r.ok) throw new ApiError(502, `LLM 서버 응답 오류: HTTP ${r.status}`);
  const data = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function registerAiRoutes(app: FastifyInstance) {
  // GET /api/ai/health — 활성 여부 + 설정 정보
  app.get("/api/ai/health", { preHandler: [app.authenticate] }, async () => ({
    enabled: !!AI_BASE_URL,
    base_url: AI_BASE_URL || null,
    model: AI_MODEL,
    provider: AI_PROVIDER,
  }));

  // POST /api/ai/chat — 자유 호출
  app.post("/api/ai/chat", { preHandler: [app.authenticate] }, async (req) => {
    const body = ChatBody.parse(req.body);
    const reply = await callLLM(body.messages, body.format);
    return { result: reply };
  });

  // POST /api/ai/task — 사전 정의된 작업
  app.post("/api/ai/task", { preHandler: [app.authenticate] }, async (req) => {
    const body = TaskBody.parse(req.body);
    const systemPrompt = TASK_PROMPTS[body.task];
    if (!systemPrompt) throw new ApiError(400, `지원하지 않는 task: ${body.task}`);

    const userContent = JSON.stringify({
      ...body.input,
      ...(body.context ? { context: body.context } : {}),
    });

    const reply = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ], body.task === "classify_complaint" ? "json" : "text");

    // 감사 로그 (AI 사용 추적)
    await recordAudit({
      action: "EXPORT", // AI 작업도 export 카테고리로 (별도 enum 추가는 후속)
      table: "ai_calls",
      recordId: body.task,
      user: req.authUser!,
      diff: { after: { task: body.task, model: AI_MODEL, response_length: reply.length } },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // classify_complaint은 JSON, 그 외는 result 필드에 텍스트
    if (body.task === "classify_complaint") {
      try {
        return JSON.parse(reply);
      } catch {
        return { result: reply };
      }
    }
    return { result: reply };
  });
}
