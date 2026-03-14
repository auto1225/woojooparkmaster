import { supabase } from "@/integrations/supabase/client";

interface LogParams {
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
}

export async function logActivity(params: LogParams) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  await supabase.from("activity_logs").insert({
    user_id: user.id,
    user_name: profile?.name || user.email?.split("@")[0] || "Unknown",
    module: params.module,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    target_name: params.targetName,
    details: params.details as Record<string, unknown>,
  });
}
