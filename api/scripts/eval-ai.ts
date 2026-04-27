/**
 * AI 한국어 task 평가 프레임워크.
 *
 * Ollama 등 내부 LLM이 활성화된 상태에서 실행. 각 task별 사전 정의된
 * 한국어 입력에 대해 모델 응답을 받아와 품질을 점수화한다.
 *
 * 사용:
 *   npm run eval:ai
 *
 * 환경 변수:
 *   AI_BASE_URL, AI_MODEL, AI_PROVIDER (서버 .env 와 동일)
 *
 * 평가 task (실제 운영 시나리오 기반):
 *   1. classify_complaint — 한국어 민원 텍스트 → JSON 분류
 *   2. draft_response — 민원 회신 초안 (정중·공식적 어조)
 *   3. summarize_report — 운영 데이터 요약
 *
 * 출력:
 *   각 task의 응답·소요시간·간단한 휴리스틱 점수 (JSON 유효성, 길이, 한국어 비율 등)
 */
import { env } from "../src/env.js";

const AI_BASE_URL = process.env.AI_BASE_URL ?? "";

if (!AI_BASE_URL) {
  console.error("❌ AI_BASE_URL 이 비어있습니다. .env에 설정 후 재실행하세요.");
  process.exit(1);
}

const AI_MODEL = process.env.AI_MODEL ?? "qwen2.5:7b";
const AI_PROVIDER = process.env.AI_PROVIDER ?? "ollama";

interface TaskCase {
  task: string;
  input: Record<string, unknown>;
  expectations: string[];
}

const CASES: TaskCase[] = [
  {
    task: "classify_complaint",
    input: {
      title: "주차요금 과다 청구",
      content: "오늘 시청 주차장에서 주차요금이 평소의 2배가 청구되었습니다. 영수증도 안 줍니다. 빠른 환불 요청합니다.",
    },
    expectations: ["fee", "high|urgent|normal", "operations", "JSON 유효"],
  },
  {
    task: "draft_response",
    input: {
      title: "주차요금 과다 청구",
      content: "오늘 시청 주차장에서 주차요금이 평소의 2배가 청구되었습니다.",
      category: "fee",
    },
    expectations: ["사과/공감 표현", "조치 안내", "200자 내외"],
  },
  {
    task: "summarize_report",
    input: {
      template: "월간 수입 보고서",
      params: { month: "2026-04", lots: 12 },
    },
    expectations: ["요약 1-2문단", "한국어 표준 어휘"],
  },
];

async function callAI(task: string, input: any): Promise<{ result: string; ms: number }> {
  const start = Date.now();
  // 백엔드의 /api/ai/task 호출 — 인증 쿠키 없이 직접 LLM 서버 호출 (admin token 필요할 수도)
  // 단순화: Ollama/OpenAI 호환 직접 호출
  const messages = [
    {
      role: "system" as const,
      content: getSystemPrompt(task),
    },
    {
      role: "user" as const,
      content: JSON.stringify(input),
    },
  ];

  if (AI_PROVIDER === "ollama") {
    const r = await fetch(`${AI_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, messages, stream: false, format: task === "classify_complaint" ? "json" : undefined }),
    });
    const data = await r.json() as { message?: { content?: string } };
    return { result: data.message?.content ?? "", ms: Date.now() - start };
  } else {
    const r = await fetch(`${AI_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer dummy" },
      body: JSON.stringify({ model: AI_MODEL, messages }),
    });
    const data = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { result: data.choices?.[0]?.message?.content ?? "", ms: Date.now() - start };
  }
}

function getSystemPrompt(task: string): string {
  const prompts: Record<string, string> = {
    classify_complaint: '공영주차장 민원 분류 전문가. JSON으로 {"category": "...", "priority": "...", "assigned_team": "...", "summary": "...", "keywords": []}',
    draft_response: "공영주차장 민원 회신 담당 공무원. 정중하고 공식적인 어조로 200자 내외.",
    summarize_report: "공영주차장 운영 분석 전문가. 데이터 기반 인사이트 1-2문단.",
  };
  return prompts[task] ?? "";
}

function score(task: string, response: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;

  // 한국어 비율 (한글이 50% 이상)
  const koreanChars = (response.match(/[가-힯]/g) ?? []).length;
  const totalChars = response.length;
  const krRatio = totalChars > 0 ? koreanChars / totalChars : 0;
  if (krRatio > 0.3) { score += 25; notes.push(`한국어 ${(krRatio*100).toFixed(0)}%`); }

  // 길이 적정성
  if (task === "draft_response" && totalChars > 50 && totalChars < 500) {
    score += 25;
    notes.push("길이 적정");
  } else if (task === "summarize_report" && totalChars > 100) {
    score += 25;
    notes.push("길이 OK");
  } else if (task === "classify_complaint") {
    // JSON 유효성
    try {
      const j = JSON.parse(response);
      if (j.category && j.priority) {
        score += 50;
        notes.push("JSON 유효");
      }
    } catch {
      notes.push("❌ JSON 파싱 실패");
    }
  }

  // 응답 비어있지 않음
  if (response.trim().length > 0) {
    score += 25;
    notes.push("응답 있음");
  }

  return { score, notes };
}

async function main() {
  console.log(`=== AI 한국어 평가 (${AI_PROVIDER}, ${AI_MODEL}) ===\n`);

  let totalScore = 0;
  let totalTime = 0;

  for (const c of CASES) {
    console.log(`▶ ${c.task}`);
    console.log(`  입력: ${JSON.stringify(c.input).slice(0, 80)}...`);
    try {
      const { result, ms } = await callAI(c.task, c.input);
      const { score: s, notes } = score(c.task, result);
      console.log(`  응답 (${ms}ms): ${result.slice(0, 200).replace(/\n/g, " ⏎ ")}${result.length > 200 ? "..." : ""}`);
      console.log(`  점수: ${s}/100 — ${notes.join(", ")}`);
      console.log();
      totalScore += s;
      totalTime += ms;
    } catch (e) {
      console.log(`  ❌ 호출 실패: ${(e as Error).message}\n`);
    }
  }

  const avgScore = CASES.length > 0 ? totalScore / CASES.length : 0;
  const avgTime = CASES.length > 0 ? totalTime / CASES.length : 0;
  console.log(`=== 평균: 점수 ${avgScore.toFixed(1)}/100, 응답시간 ${avgTime.toFixed(0)}ms ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
