import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { isModuleEnabled } from "@/lib/authorization";
import { SCHEDULE_TYPE_LABELS } from "@/types/facility";
import { OPEN_COMPLAINT_STATUSES, OPEN_MAINTENANCE_STATUSES } from "@/lib/work-status";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";

export type WorkKind = "complaint" | "maintenance" | "schedule" | "survey" | "approval" | "team_work";

export interface MyWorkItem {
  id: string;
  kind: WorkKind;
  title: string;
  context: string;
  status: string;
  priority: "critical" | "high" | "normal" | "low";
  dueDate?: string | null;
  nextAction?: string | null;
  route: string;
}

export interface MyWorkResult {
  items: MyWorkItem[];
  failedSources: string[];
}

function normalizeMaintenancePriority(priority: string): MyWorkItem["priority"] {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
}

function lotContext(lot?: { name?: string | null; lot_type?: string | null } | null) {
  if (!lot?.name) return "주차장 미지정";
  const type = lot.lot_type ? LOT_TYPE_LABELS[lot.lot_type as LotType] : "";
  return `${lot.name}${type ? ` · ${type}` : ""}`;
}

function addCalendarDays(value?: string | null, days = 0) {
  if (!value) return null;
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
      if (!user) return { items: [], failedSources: [] } satisfies MyWorkResult;
      const jobs: Array<{ source: string; task: Promise<MyWorkItem[]> }> = [];

      const addJob = (source: string, task: Promise<MyWorkItem[]>) => jobs.push({ source, task });

      addJob("팀 업무", (async () => {
        const { data, error } = await (supabase as any).from("team_work_records")
          .select("id, record_number, record_type, title, category, status, priority, due_date, document_number, next_action, lot_id, parking_lots(name, lot_type)")
          .eq("owner_id", user.id)
          .is("archived_at", null)
          .neq("status", "completed");
        if (error) throw error;
        return (data ?? []).map((item: any) => ({
          id: item.id,
          kind: "team_work" as const,
          title: item.title,
          context: `${item.record_number} · ${item.parking_lots ? lotContext(item.parking_lots) : item.category}${item.document_number ? ` · ${item.document_number}` : ""}`,
          status: item.status,
          priority: item.priority === "urgent" ? "critical" : item.priority === "high" ? "high" : item.priority === "low" ? "low" : "normal",
          dueDate: item.due_date,
          nextAction: item.next_action,
          route: `/team-work?tab=${item.record_type}&work=${item.id}`,
        }));
      })());

      if (active("COMPLAINT")) {
        addJob("민원", (async () => {
          const { data, error } = await supabase.from("complaints")
            .select("id, complaint_number, title, status, priority, due_date, parking_lots(name, lot_type)")
            .eq("assigned_to", user.id)
            .in("status", OPEN_COMPLAINT_STATUSES);
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "complaint" as const,
            title: item.title,
            context: `${item.complaint_number} · ${lotContext(item.parking_lots)}`,
            status: item.status,
            priority: item.priority === "urgent" ? "critical" : item.priority === "high" ? "high" : item.priority === "low" ? "low" : "normal",
            dueDate: item.due_date,
            route: `/complaints/${item.id}`,
          }));
        })());
      }

      if (active("FACILITY")) {
        addJob("유지보수", (async () => {
          const { data, error } = await supabase.from("maintenance_logs")
            .select("id, log_number, title, status, priority, due_date, schedule_id, parking_lots(name, lot_type), maintenance_schedules(next_due_date)")
            .eq("assigned_to", user.id)
            .in("status", OPEN_MAINTENANCE_STATUSES);
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "maintenance" as const,
            title: item.title,
            context: `${item.log_number} · ${lotContext(item.parking_lots)}${!item.due_date && item.maintenance_schedules?.next_due_date ? " · 정기점검 예정일 기준" : ""}`,
            status: item.status,
            priority: normalizeMaintenancePriority(item.priority),
            dueDate: item.due_date || item.maintenance_schedules?.next_due_date,
            route: `/facility/maintenance?work=${item.id}`,
          }));
        })());

        addJob("점검 일정", (async () => {
          const { data, error } = await supabase.from("maintenance_schedules")
            .select("id, schedule_name, next_due_date, schedule_type, parking_lots(name, lot_type)")
            .eq("assigned_to", user.id)
            .eq("is_active", true)
            .lte("next_due_date", new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "schedule" as const,
            title: item.schedule_name,
            context: `${lotContext(item.parking_lots)} · ${SCHEDULE_TYPE_LABELS[item.schedule_type] || item.schedule_type}`,
            status: "scheduled",
            priority: "normal" as const,
            dueDate: item.next_due_date,
            route: `/facility/schedule?schedule=${item.id}`,
          }));
        })());
      }

      if (active("SURVEY")) {
        addJob("현황조사", (async () => {
          const { data, error } = await supabase.from("surveys")
            .select("id, status, survey_date, parking_lots(name, lot_type)")
            .eq("surveyor_id", user.id)
            .in("status", ["draft", "in_progress", "rejected"]);
          if (error) throw error;
          return (data ?? []).map((item: any) => ({
            id: item.id,
            kind: "survey" as const,
            title: `${lotContext(item.parking_lots)} 현황조사`,
            context: item.status === "rejected" ? "보완 후 다시 제출해야 합니다" : "현장조사 작성 중",
            status: item.status,
            priority: item.status === "rejected" ? "high" as const : "normal" as const,
            dueDate: item.survey_date,
            route: `/surveys/${item.id}`,
          }));
        })());

        if (profile?.role === "admin" || profile?.role === "manager") {
          addJob("조사 승인", (async () => {
            const { data, error } = await supabase.from("surveys")
              .select("id, status, submitted_at, parking_lots(name, lot_type)")
              .in("status", ["submitted", "review"]);
            if (error) throw error;
            return (data ?? []).map((item: any) => ({
              id: item.id,
              kind: "approval" as const,
              title: `${lotContext(item.parking_lots)} 조사 승인`,
              context: "제출 후 3일 검토 기준",
              status: item.status,
              priority: "high" as const,
              dueDate: addCalendarDays(item.submitted_at, 3),
              nextAction: "조사 내용을 검토하고 승인 또는 반려",
              route: `/surveys/${item.id}/review`,
            }));
          })());
        }
      }

      const results = await Promise.allSettled(jobs.map((job) => job.task));
      const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      return {
        items: sortMyWork(items),
        failedSources: results.flatMap((result, index) => result.status === "rejected" ? [jobs[index].source] : []),
      } satisfies MyWorkResult;
    },
    enabled: Boolean(user && licenses),
    refetchInterval: 60_000,
  });
}
