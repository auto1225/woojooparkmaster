import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { runReportSchedule } from "@/lib/report-engine";

export function useOperationalMonitor() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (profile?.role !== "admin" && profile?.role !== "manager") return;
    let active = true;

    const run = async () => {
      const { data, error } = await (supabase.rpc as any)("monitor_complaint_sla");
      if (active && !error && data) {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["complaints"] });
        queryClient.invalidateQueries({ queryKey: ["my-work"] });
      }

      const { data: sensorResult, error: sensorError } = await (supabase.rpc as any)("monitor_sensor_anomalies");
      if (active && !sensorError && sensorResult) {
        queryClient.invalidateQueries({ queryKey: ["sensor-incidents"] });
        queryClient.invalidateQueries({ queryKey: ["sensors-list"] });
        queryClient.invalidateQueries({ queryKey: ["maintenance-logs"] });
        queryClient.invalidateQueries({ queryKey: ["my-work"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }

      for (let index = 0; active && index < 3; index += 1) {
        const { data: schedules, error: scheduleError } = await (supabase.rpc as any)("claim_due_report_schedule");
        const schedule = Array.isArray(schedules) ? schedules[0] : null;
        if (scheduleError || !schedule) break;
        try {
          await runReportSchedule(schedule, profile.id, true);
        } catch {
          // The engine records the failed run and releases the schedule lock.
        }
      }
      if (active) {
        queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
        queryClient.invalidateQueries({ queryKey: ["report-history"] });
      }
    };

    void run();
    const timer = window.setInterval(run, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [profile?.id, profile?.role, queryClient]);
}
