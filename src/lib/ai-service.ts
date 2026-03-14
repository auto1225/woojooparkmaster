import { supabase } from "@/integrations/supabase/client";

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

export async function callAI(params: CallAIParams): Promise<AIResult> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: params,
  });
  if (error) throw new Error(error.message || 'AI 호출 실패');
  return data;
}
