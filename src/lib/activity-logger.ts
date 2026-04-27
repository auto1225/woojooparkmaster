import { supabase } from "@/integrations/api/supabase-compat";
import { authApi } from "@/integrations/api";

interface LogParams {
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
}

export async function logActivity(params: LogParams) {
  const user = await authApi.me();
  if (!user) return;

  await supabase.from("activity_logs").insert([{
    user_id: user.id,
    user_name: user.name || user.email?.split("@")[0] || "Unknown",
    module: params.module,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    target_name: params.targetName,
    details: (params.details || null) as any,
    user_agent: navigator.userAgent,
    page_path: window.location.pathname,
  }]);
}
