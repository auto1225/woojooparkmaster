import { supabase } from "@/integrations/supabase/client";
import { runtimeConfig } from "@/config/runtime-config";

export type AITask = "classify_complaint" | "draft_response" | "summarize_report" | "predict_demand" | "analyze_revenue";

interface CallAIParams {
  task: AITask;
  input: Record<string, unknown>;
  context?: string;
}

export interface AISource {
  path: string;
  label: string;
}

export interface AIResult {
  result?: string;
  confidence?: number;
  sources: AISource[];
  assistanceId?: string;
  [key: string]: any;
}

function collectSources(value: unknown, prefix = "input", output: AISource[] = []): AISource[] {
  if (output.length >= 16 || value === null || value === undefined || value === "") return output;
  if (Array.isArray(value)) {
    if (value.length) output.push({ path: prefix, label: `${prefix} (${value.length}건)` });
    return output;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      collectSources(nested, `${prefix}.${key}`, output);
    });
    return output;
  }
  output.push({ path: prefix, label: prefix.replace(/^input\./, "") });
  return output;
}

export async function callAI(params: CallAIParams): Promise<AIResult> {
  if (!runtimeConfig.externalAiEnabled) {
    throw new Error('외부 AI 연동이 기관 운영 설정에서 비활성화되어 있습니다.');
  }

  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: params,
  });
  if (error) throw new Error(error.message || 'AI 호출 실패');
  if (data?.error) throw new Error(data.error);

  const sources = collectSources(params.input);
  const confidence = typeof data?.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : undefined;
  const { data: { user } } = await supabase.auth.getUser();
  let assistanceId: string | undefined;
  if (user) {
    const { data: log } = await (supabase as any).from("ai_assistance_logs")
      .insert({
        user_id: user.id,
        task: params.task,
        source_paths: sources.map((source) => source.path),
        output: data || {},
        confidence: confidence ?? null,
      })
      .select("id")
      .single();
    assistanceId = log?.id;
  }
  return { ...(data || {}), confidence, sources, assistanceId };
}

export async function reviewAIAssistance(
  assistanceId: string | undefined,
  options: { applied: boolean; edited?: boolean; targetType?: string; targetId?: string } = { applied: false },
) {
  if (!assistanceId) return;
  await (supabase as any).from("ai_assistance_logs")
    .update({
      applied: options.applied,
      edited_before_apply: options.edited || false,
      target_type: options.targetType || null,
      target_id: options.targetId || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", assistanceId);
}
