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
  const { error } = await (supabase.rpc as any)("write_activity_event", {
    p_module: params.module,
    p_action: params.action,
    p_target_type: params.targetType || null,
    p_target_id: params.targetId || null,
    p_target_name: params.targetName || null,
    p_details: params.details || null,
  });
  if (!error) return;

  // Compatibility path while the server migration is rolling out.
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  if (!message.includes("pgrst202") && !message.includes("could not find the function") && !message.includes("404")) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
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
