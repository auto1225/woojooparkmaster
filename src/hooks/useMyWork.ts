import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { isModuleEnabled } from "@/lib/authorization";
import { SCHEDULE_TYPE_LABELS } from "@/types/facility";
import { OPEN_COMPLAINT_STATUSES, OPEN_MAINTENANCE_STATUSES } from "@/lib/work-status";

export type WorkKind = "complaint" | "maintenance" | "schedule" | "survey" | "approval";

export interface MyWorkItem {
  id: string;
  kind: WorkKind;
  title: string;
  context: string;
  status: string;
  priority: "critical" | "high" | "normal" | "low";
  dueDate?: string | null;
  route: string;
}

function normalizeMaintenancePriority(priority: string): MyWorkItem["priority"] {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
}

export function isWorkOverdue(item: Pick<MyWorkItem, "dueDate" | "status">): boolean {
  if (!item.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime() && !["closed", "verified", "approved"].includes(item.status);
}

export function isWorkDueToday(item: Pick<MyWorkItem, "dueDate" | "status">): boolean {
  if (!item.dueDate || ["closed", "verified", "approved"].includes(item.status)) return false;
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return item.dueDate.slice(0, 10) === localToday;
}

export function isWorkUrgent(item: Pick<MyWorkItem, "priority" | "status">): boolean {
  return item.priority === "critical" && !["closed", "verified", "approved"].includes(item.status);
}

export function sortMyWork(items: MyWorkItem[]): MyWorkItem[] {
  const priorityRank = { critical: 0, high: 1, normal: 2, low: 3 };
  return [...items].sort((a, b) => {
    const overdue = Number(isWorkOverdue(b)) - Number(isWorkOverdue(a));
    if (overdue) return overdue;
    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    if (priority) return priority;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.dueDate ? -1 : b.dueDate ? 1 : 0;
  });
}

export function useMyWork() {
  const { user, profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const active = (code: string) => isModuleEnabled(licenses, code);

  return useQuery({
    queryKey: ["my-work", user?.id, profile?.role, licenses?.map((license) => `${license.module_code}:${license.is_active}`).join("|")],
    queryFn: async () => {
      if (!user) return [];
      const jobs: Array<Promise<MyWorkItem[]>> = [];

      if (active("COMPLAINT")) {
        jobs.push((async () => {
          const { data, error } = await supabase.from("complaints")
            .select("id, complaint_number, title, status, priority, due_date, parking_lots(name)")
            .eq("assigned_to", user.id)
            .in("status", OPEN_COMPLAINT_STATUSES);
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "complaint" as const,
            title: item.title,
            context: `${item.complaint_number} · ${item.parking_lots?.name || "주차장 미지정"}`,
            status: item.status,
            priority: item.priority === "urgent" ? "critical" : item.priority === "high" ? "high" : item.priority === "low" ? "low" : "normal",
            dueDate: item.due_date,
            route: `/complaints/${item.id}`,
          }));
        })());
      }

      if (active("FACILITY")) {
        jobs.push((async () => {
          const { data, error } = await supabase.from("maintenance_logs")
            .select("id, log_number, title, status, priority, due_date, schedule_id, parking_lots(name), maintenance_schedules(next_due_date)")
            .eq("assigned_to", user.id)
            .in("status", OPEN_MAINTENANCE_STATUSES);
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "maintenance" as const,
            title: item.title,
            context: `${item.log_number} · ${item.parking_lots?.name || "주차장"}`,
            status: item.status,
            priority: normalizeMaintenancePriority(item.priority),
            dueDate: item.due_date || item.maintenance_schedules?.next_due_date,
            route: `/facility/maintenance?work=${item.id}`,
          }));
        })());

        jobs.push((async () => {
          const { data, error } = await supabase.from("maintenance_schedules")
            .select("id, schedule_name, next_due_date, schedule_type, parking_lots(name)")
            .eq("assigned_to", user.id)
            .eq("is_active", true)
            .lte("next_due_date", new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "schedule" as const,
            title: item.schedule_name,
            context: `${item.parking_lots?.name || "주차장"} · ${SCHEDULE_TYPE_LABELS[item.schedule_type] || item.schedule_type}`,
            status: "scheduled",
            priority: "normal" as const,
            dueDate: item.next_due_date,
            route: `/facility/schedule?schedule=${item.id}`,
          }));
        })());
      }

      if (active("SURVEY")) {
        jobs.push((async () => {
          const { data, error } = await supabase.from("surveys")
            .select("id, status, survey_date, parking_lots(name)")
            .eq("surveyor_id", user.id)
            .in("status", ["draft", "in_progress", "rejected"]);
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "survey" as const,
            title: `${item.parking_lots?.name || "주차장"} 현황조사`,
            context: item.status === "rejected" ? "보완 후 다시 제출해야 합니다" : "현장조사 작성 중",
            status: item.status,
            priority: item.status === "rejected" ? "high" as const : "normal" as const,
            dueDate: item.survey_date,
            route: `/surveys/${item.id}`,
          }));
        })());

        if (profile?.role === "admin" || profile?.role === "manager") {
          jobs.push((async () => {
            const { data, error } = await supabase.from("surveys")
              .select("id, status, submitted_at, parking_lots(name)")
              .in("status", ["submitted", "review"]);
            if (error) throw error;
            return (data ?? []).map((item: any) => ({
              id: item.id,
              kind: "approval" as const,
              title: `${item.parking_lots?.name || "주차장"} 조사 승인`,
              context: "제출된 조사 검토",
              status: item.status,
              priority: "high" as const,
              dueDate: item.submitted_at?.slice(0, 10),
              route: `/surveys/${item.id}/review`,
            }));
          })());
        }
      }

      const results = await Promise.allSettled(jobs);
      const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      return sortMyWork(items);
    },
    enabled: Boolean(user && licenses),
    refetchInterval: 60_000,
  });
}
