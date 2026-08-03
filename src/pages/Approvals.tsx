import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownUp,
  Briefcase,
  CalendarClock,
  Check,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Gavel,
  Megaphone,
  RotateCcw,
  Search,
  Send,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { processApprovalStep } from "@/lib/approval-service";
import { isModuleEnabled } from "@/lib/authorization";
import { logActivity } from "@/lib/activity-logger";
import { formatManWon } from "@/lib/validators";
import { advanceServicePayment, decideServiceInspection, decideSurvey } from "@/lib/workflow-commands";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";

type Decision = "approved" | "rejected";
type SortMode = "latest" | "oldest" | "amount_desc" | "amount_asc" | "title";

interface ApprovalItem {
  key: string;
  id: string;
  module: string;
  table: string;
  title: string;
  subtitle?: string;
  requester?: string;
  requestDate: string;
  amount?: number;
  status: string;
  link?: string;
  refNumber?: string;
  documentNumber?: string;
  lotName?: string;
  lotType?: string;
  projectId?: string;
  documentRefId?: string;
  workflowRecordId?: string;
  workflowStepId?: string;
  currentStep?: number;
  totalSteps?: number;
  dataIssue?: string;
  actionable?: boolean;
}

interface ApprovalQueryResult {
  items: ApprovalItem[];
  failures: string[];
}

const MODULE_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  SURVEY: { label: "조사", icon: ClipboardList, color: "border-l-blue-500" },
  BUDGET: { label: "예산", icon: Wallet, color: "border-l-emerald-500" },
  PROCUREMENT: { label: "입찰", icon: Gavel, color: "border-l-violet-500" },
  SERVICE: { label: "용역", icon: Briefcase, color: "border-l-amber-500" },
  COMPLAINT: { label: "민원", icon: Megaphone, color: "border-l-rose-500" },
};

const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장",
  multilevel: "주차빌딩",
  onstreet: "노상주차장",
  vacant_lot: "공한지주차장",
  underground: "지하주차장",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: "선금",
  progress: "기성금",
  completion: "준공금",
  final: "최종 지급",
};

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  progress: "기성검사",
  final: "준공검사",
  regular: "정기검사",
  special: "특별검사",
};

function normalizeModule(module: string) {
  const value = module.toUpperCase();
  if (value === "BID") return "PROCUREMENT";
  return value;
}

function sourceLink(module: string, documentType: string, refId: string) {
  switch (normalizeModule(module)) {
    case "SURVEY": return `/surveys/${refId}/review`;
    case "BUDGET": return documentType === "transfer" ? `/budget/transfers?record=${refId}` : `/budget/executions?record=${refId}`;
    case "PROCUREMENT": return `/procurement/projects/${refId}`;
    case "SERVICE": return `/service/projects/${refId}`;
    case "COMPLAINT": return `/complaints/${refId}`;
    default: return undefined;
  }
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary" }> = {
    pending: { label: "대기", variant: "secondary" },
    submitted: { label: "상신", variant: "secondary" },
    in_progress: { label: "결재 중", variant: "outline" },
    approved: { label: "승인", variant: "default" },
    rejected: { label: "반려", variant: "destructive" },
    withdrawn: { label: "회수", variant: "secondary" },
    review: { label: "검토", variant: "outline" },
    requested: { label: "요청", variant: "secondary" },
    reviewing: { label: "검토", variant: "outline" },
  };
  const item = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

async function addDocumentNumbers(items: ApprovalItem[]) {
  const ids = Array.from(new Set(items.map((item) => item.documentRefId || item.id).filter(Boolean)));
  if (!ids.length) return items;
  const { data: links, error: linkError } = await supabase
    .from("attachments")
    .select("module, ref_id, file_path")
    .eq("ref_type", "official_document_link")
    .in("ref_id", ids);
  if (linkError) throw linkError;
  const documentIds = Array.from(new Set((links || []).map((link) => link.file_path.replace("parkmaster-document://", ""))));
  if (!documentIds.length) return items;
  const { data: documents, error: documentError } = await supabase
    .from("code_master")
    .select("id, code, name_en, extra")
    .eq("group_code", "OFFICIAL_DOCUMENT")
    .in("id", documentIds);
  if (documentError) throw documentError;
  const numberById = new Map((documents || []).map((document: any) => [document.id, document.extra?.document_number || document.name_en || document.code]));
  return items.map((item) => {
    const refId = item.documentRefId || item.id;
    const numbers = (links || [])
      .filter((link) => link.ref_id === refId && normalizeModule(link.module) === normalizeModule(item.module))
      .map((link) => numberById.get(link.file_path.replace("parkmaster-document://", "")))
      .filter(Boolean);
    return { ...item, documentNumber: numbers.join(", ") || item.documentNumber };
  });
}

function sortItems(items: ApprovalItem[], mode: SortMode) {
  return [...items].sort((a, b) => {
    if (mode === "title") return a.title.localeCompare(b.title, "ko");
    if (mode === "amount_desc") return (b.amount || 0) - (a.amount || 0);
    if (mode === "amount_asc") return (a.amount || 0) - (b.amount || 0);
    const difference = new Date(b.requestDate || 0).getTime() - new Date(a.requestDate || 0).getTime();
    return mode === "oldest" ? -difference : difference;
  });
}

export default function Approvals() {
  const { user, profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canApprove = profile?.role === "admin" || profile?.role === "manager";
  const activeModules = useMemo(() => new Set(Object.keys(MODULE_META).filter((code) => isModuleEnabled(licenses, code))), [licenses]);
  const moduleKey = Array.from(activeModules).sort().join(",");
  const [tab, setTab] = useState(searchParams.get("status") === "pending" && canApprove ? "pending" : canApprove ? "pending" : "my");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState(searchParams.get("module")?.toUpperCase() || "all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [ageFilter, setAgeFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [missingDocumentOnly, setMissingDocumentOnly] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; decision: Decision; items: ApprovalItem[] }>({ open: false, decision: "approved", items: [] });
  const [comment, setComment] = useState("");

  const pendingQuery = useQuery<ApprovalQueryResult>({
    queryKey: ["approvals-pending-v2", user?.id, moduleKey],
    enabled: Boolean(user && canApprove),
    queryFn: async () => {
      const items: ApprovalItem[] = [];
      const failures: string[] = [];

      const formal = await supabase
        .from("approval_records")
        .select("*, initiator:profiles!approval_records_initiated_by_fkey(name), approval_steps(*)")
        .eq("status", "in_progress")
        .order("initiated_at", { ascending: false });
      if (formal.error) failures.push("결재선");
      const seenFormal = new Set<string>();
      (formal.data || []).forEach((record: any) => {
        const module = normalizeModule(record.module);
        if (!activeModules.has(module)) return;
        const identity = `${module}:${record.document_type}:${record.ref_number || record.ref_id}:${record.title}`;
        if (seenFormal.has(identity)) return;
        seenFormal.add(identity);
        const step = (record.approval_steps || []).find((candidate: any) => candidate.step_number === record.current_step);
        const isDemoOrphan = record.ref_number?.startsWith("APR-DEMO-");
        const isAssignedApprover = !step?.approver_id || step.approver_id === user?.id;
        items.push({
          key: `workflow:${record.id}`,
          id: record.ref_id,
          module,
          table: "approval_records",
          title: record.title,
          subtitle: `${record.document_type} · ${step?.step_label || `${record.current_step}단계`}`,
          requester: record.initiator?.name,
          requestDate: record.initiated_at,
          status: record.status,
          refNumber: record.ref_number,
          link: isDemoOrphan ? undefined : sourceLink(module, record.document_type, record.ref_id),
          workflowRecordId: record.id,
          workflowStepId: step?.id,
          currentStep: record.current_step,
          totalSteps: record.total_steps,
          actionable: Boolean(step?.id) && !isDemoOrphan && isAssignedApprover,
          dataIssue: isDemoOrphan ? "원업무가 없는 중복 샘플 결재" : !step?.id ? "현재 결재 단계 누락" : !isAssignedApprover ? "다른 담당자의 결재 단계" : undefined,
        });
      });

      if (activeModules.has("SURVEY")) {
        const result = await supabase.from("surveys")
          .select("id, parking_lots(name, lot_type), surveyor:profiles!surveys_surveyor_id_fkey(name), survey_date, submitted_at, status")
          .in("status", ["submitted", "review"]).order("submitted_at", { ascending: false });
        if (result.error) failures.push("조사");
        (result.data || []).forEach((survey: any) => items.push({
          key: `surveys:${survey.id}`, id: survey.id, module: "SURVEY", table: "surveys",
          title: survey.parking_lots?.name || "주차장 미지정", subtitle: `조사자: ${survey.surveyor?.name || "-"}`,
          requester: survey.surveyor?.name, requestDate: survey.submitted_at || survey.survey_date, status: survey.status,
          link: `/surveys/${survey.id}/review`, lotName: survey.parking_lots?.name, lotType: survey.parking_lots?.lot_type,
        }));
      }

      if (activeModules.has("BUDGET")) {
        const executions = await supabase.from("budget_executions")
          .select("id, execution_number, document_number, description, vendor_name, amount, execution_date, created_at, status, parking_lots(name, lot_type)")
          .eq("status", "pending").order("created_at", { ascending: false });
        if (executions.error) failures.push("예산 집행");
        (executions.data || []).forEach((execution: any) => items.push({
          key: `budget_executions:${execution.id}`, id: execution.id, module: "BUDGET", table: "budget_executions",
          title: execution.description, subtitle: `거래처: ${execution.vendor_name || "-"}`, amount: execution.amount,
          requestDate: execution.created_at || execution.execution_date, status: execution.status,
          refNumber: execution.execution_number, documentNumber: execution.document_number || undefined,
          link: `/budget/executions?record=${execution.id}`, lotName: execution.parking_lots?.name, lotType: execution.parking_lots?.lot_type,
        }));
        const transfers = await supabase.from("budget_transfers")
          .select("id, transfer_number, approval_number, transfer_type, reason, amount, status, created_at")
          .eq("status", "pending").order("created_at", { ascending: false });
        if (transfers.error) failures.push("예산 전용·이체");
        (transfers.data || []).forEach((transfer: any) => items.push({
          key: `budget_transfers:${transfer.id}`, id: transfer.id, module: "BUDGET", table: "budget_transfers",
          title: `예산 ${transfer.transfer_type === "transfer" ? "전용" : "이체"}`, subtitle: transfer.reason,
          refNumber: transfer.transfer_number, documentNumber: transfer.approval_number || undefined, amount: transfer.amount, requestDate: transfer.created_at, status: transfer.status,
          link: `/budget/transfers?record=${transfer.id}`,
        }));
      }

      if (activeModules.has("PROCUREMENT")) {
        const result = await supabase.from("bid_projects")
          .select("id, bid_number, document_number, title, bid_type, estimated_amount, status, created_at, submitted_at, submitted_by, parking_lots(name, lot_type)")
          .eq("status", "review").order("created_at", { ascending: false });
        if (result.error) failures.push("입찰");
        (result.data || []).forEach((project: any) => items.push({
          key: `bid_projects:${project.id}`, id: project.id, module: "PROCUREMENT", table: "bid_projects",
          title: project.title, subtitle: `입찰방식: ${project.bid_type === "private" ? "수의계약" : project.bid_type}`,
          refNumber: project.bid_number, documentNumber: project.document_number || undefined, amount: project.estimated_amount, requestDate: project.submitted_at || project.created_at, status: project.status,
          link: `/procurement/projects/${project.id}`, lotName: project.parking_lots?.name, lotType: project.parking_lots?.lot_type,
        }));
      }

      if (activeModules.has("SERVICE")) {
        const inspections = await supabase.from("service_inspections")
          .select("id, project_id, service_projects(title, lot_id, parking_lots(name, lot_type)), inspection_number, inspection_type, target_amount, status, created_at")
          .eq("status", "pending").order("created_at", { ascending: false });
        if (inspections.error) failures.push("용역 검수");
        (inspections.data || []).forEach((inspection: any) => items.push({
          key: `service_inspections:${inspection.id}`, id: inspection.id, module: "SERVICE", table: "service_inspections",
          title: inspection.service_projects?.title || "용역사업", subtitle: INSPECTION_TYPE_LABELS[inspection.inspection_type] || inspection.inspection_type,
          refNumber: inspection.inspection_number, amount: inspection.target_amount, requestDate: inspection.created_at, status: inspection.status,
          link: `/service/projects/${inspection.project_id}?tab=inspections`, projectId: inspection.project_id, documentRefId: inspection.project_id,
          lotName: inspection.service_projects?.parking_lots?.name, lotType: inspection.service_projects?.parking_lots?.lot_type,
        }));
        const payments = await supabase.from("service_payments")
          .select("id, project_id, service_projects(title, lot_id, parking_lots(name, lot_type)), payment_number, payment_type, net_amount, status, created_at")
          .in("status", ["requested", "reviewing"]).order("created_at", { ascending: false });
        if (payments.error) failures.push("용역 지급");
        (payments.data || []).forEach((payment: any) => items.push({
          key: `service_payments:${payment.id}`, id: payment.id, module: "SERVICE", table: "service_payments",
          title: payment.service_projects?.title || "용역사업", subtitle: PAYMENT_TYPE_LABELS[payment.payment_type] || payment.payment_type,
          refNumber: payment.payment_number, amount: payment.net_amount, requestDate: payment.created_at, status: payment.status,
          link: `/service/projects/${payment.project_id}?tab=payments`, projectId: payment.project_id, documentRefId: payment.project_id,
          lotName: payment.service_projects?.parking_lots?.name, lotType: payment.service_projects?.parking_lots?.lot_type,
        }));
      }

      try {
        return { items: await addDocumentNumbers(items), failures };
      } catch {
        return { items, failures: [...failures, "문서 연결"] };
      }
    },
  });

  const myRequestQuery = useQuery<ApprovalQueryResult>({
    queryKey: ["approvals-my-requests-v2", user?.id, moduleKey],
    enabled: Boolean(user),
    queryFn: async () => {
      const items: ApprovalItem[] = [];
      const failures: string[] = [];
      const formal = await supabase.from("approval_records")
        .select("*, approval_steps(*)").eq("initiated_by", user!.id).order("initiated_at", { ascending: false });
      if (formal.error) failures.push("결재선");
      const seenFormal = new Set<string>();
      (formal.data || []).forEach((record: any) => {
        const module = normalizeModule(record.module);
        if (!activeModules.has(module)) return;
        const identity = `${module}:${record.document_type}:${record.ref_number || record.ref_id}:${record.title}`;
        if (seenFormal.has(identity)) return;
        seenFormal.add(identity);
        items.push({
          key: `workflow:${record.id}`, id: record.ref_id, module, table: "approval_records", title: record.title,
          subtitle: record.document_type, requestDate: record.initiated_at, status: record.status,
          refNumber: record.ref_number, workflowRecordId: record.id, currentStep: record.current_step, totalSteps: record.total_steps,
          link: record.ref_number?.startsWith("APR-DEMO-") ? undefined : sourceLink(module, record.document_type, record.ref_id),
        });
      });
      if (activeModules.has("SURVEY")) {
        const surveys = await (supabase.from("surveys") as any).select("id, parking_lots(name, lot_type), status, submitted_at")
          .eq("surveyor_id", user!.id).in("status", ["submitted", "approved", "rejected"]).order("submitted_at", { ascending: false });
        if (surveys.error) failures.push("조사");
        (surveys.data || []).forEach((survey: any) => items.push({
          key: `surveys:${survey.id}`, id: survey.id, module: "SURVEY", table: "surveys", title: survey.parking_lots?.name || "주차장 미지정",
          requestDate: survey.submitted_at || "", status: survey.status, link: `/surveys/${survey.id}/review`,
          lotName: survey.parking_lots?.name, lotType: survey.parking_lots?.lot_type,
        }));
      }
      if (activeModules.has("BUDGET")) {
        const executions = await supabase.from("budget_executions").select("id, description, amount, status, created_at")
          .eq("created_by", user!.id).in("status", ["pending", "approved", "rejected"]).order("created_at", { ascending: false });
        if (executions.error) failures.push("예산");
        (executions.data || []).forEach((execution: any) => items.push({
          key: `budget_executions:${execution.id}`, id: execution.id, module: "BUDGET", table: "budget_executions",
          title: execution.description, amount: execution.amount, requestDate: execution.created_at, status: execution.status,
          link: `/budget/executions?record=${execution.id}`,
        }));
      }
      try {
        return { items: await addDocumentNumbers(items), failures };
      } catch {
        return { items, failures: [...failures, "문서 연결"] };
      }
    },
  });

  const pendingItems = pendingQuery.data?.items || [];
  const myRequests = myRequestQuery.data?.items || [];
  const pendingFailures = pendingQuery.data?.failures || [];
  const myFailures = myRequestQuery.data?.failures || [];

  const filterItems = (items: ApprovalItem[]) => {
    const term = search.trim().toLocaleLowerCase("ko");
    const now = Date.now();
    const filtered = items.filter((item) => {
      if (moduleFilter !== "all" && item.module !== moduleFilter) return false;
      if (lotTypeFilter !== "all" && item.lotType !== lotTypeFilter) return false;
      if (missingDocumentOnly && item.documentNumber) return false;
      if (term && ![item.title, item.subtitle, item.refNumber, item.documentNumber, item.requester, item.lotName]
        .some((value) => (value || "").toLocaleLowerCase("ko").includes(term))) return false;
      if (ageFilter !== "all") {
        const age = Math.max(0, Math.floor((now - new Date(item.requestDate || now).getTime()) / 86400000));
        if (ageFilter === "today" && age !== 0) return false;
        if (ageFilter === "7" && age > 7) return false;
        if (ageFilter === "30" && age > 30) return false;
        if (ageFilter === "over30" && age <= 30) return false;
      }
      return true;
    });
    return sortItems(filtered, sortMode);
  };

  const filteredPending = filterItems(pendingItems);
  const filteredMyRequests = filterItems(myRequests);
  const pendingAmount = pendingItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const unlinkedCount = pendingItems.filter((item) => !item.documentNumber).length;
  const actionableCount = pendingItems.filter((item) => item.actionable !== false).length;
  const dataIssueCount = pendingItems.filter((item) => item.dataIssue).length;

  const performDecision = async (item: ApprovalItem, decision: Decision, note: string) => {
    if (item.table === "approval_records") {
      if (!item.workflowStepId) throw new Error("현재 결재 단계를 찾을 수 없습니다.");
      await processApprovalStep(item.workflowStepId, decision, user!.id, profile?.name || profile?.email || "결재자", note);
    } else if (item.table === "surveys") {
      await decideSurvey(item.id, decision, { reason: note || undefined, syncToLot: decision === "approved" });
    } else if (item.table === "service_inspections") {
      await decideServiceInspection(item.id, decision === "approved" ? "approve" : "require_correction", {
        note,
        correctionDeadline: decision === "rejected" ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) : undefined,
      });
    } else if (item.table === "service_payments" && decision === "approved") {
      await advanceServicePayment(item.id, "approve");
    } else if (item.table === "budget_executions") {
      const { error } = await (supabase as any).rpc("decide_budget_execution", {
        p_execution_id: item.id,
        p_decision: decision === "approved" ? "executed" : "rejected",
        p_reason: note || null,
      });
      if (error) throw error;
    } else if (item.table === "budget_transfers") {
      const { error } = await (supabase as any).rpc("decide_budget_transfer", {
        p_transfer_id: item.id,
        p_decision: decision === "approved" ? "executed" : "rejected",
        p_reason: note || null,
      });
      if (error) throw error;
    } else if (item.table === "bid_projects") {
      const { error } = await (supabase as any).rpc("transition_bid_project", {
        p_project_id: item.id,
        p_target_status: decision === "approved" ? "announced" : "rejected",
        p_reason: note || null,
      });
      if (error) throw error;
    } else {
      const update: Record<string, any> = { status: decision };
      if (item.table === "service_payments") {
        if (decision === "approved") {
          update.approved_by = user!.id;
          update.approved_at = new Date().toISOString();
        } else {
          update.reject_reason = note;
        }
      }
      const { error } = await (supabase.from(item.table as any) as any).update(update).eq("id", item.id);
      if (error) throw error;
    }
    await logActivity({
      module: item.module,
      action: decision === "approved" ? "결재승인" : "결재반려",
      targetType: item.table,
      targetId: item.id,
      targetName: item.title,
      details: { comment: note || null, document_number: item.documentNumber || null },
    });
  };

  const decisionMutation = useMutation({
    mutationFn: async ({ items, decision, note }: { items: ApprovalItem[]; decision: Decision; note: string }) => {
      for (const item of items) await performDecision(item, decision, note);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["approvals-pending-v2"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-my-requests-v2"] });
      queryClient.invalidateQueries({ queryKey: ["daily-operations-snapshot-v2"] });
      toast.success(variables.decision === "approved" ? "결재를 승인했습니다." : "반려 처리했습니다.");
      setSelected(new Set());
      setActionDialog({ open: false, decision: "approved", items: [] });
      setComment("");
    },
    onError: (error: any) => toast.error(error.message || "결재 처리에 실패했습니다."),
  });

  const withdrawMutation = useMutation({
    mutationFn: async (item: ApprovalItem) => {
      if (!item.workflowRecordId) throw new Error("정식 결재선 요청만 회수할 수 있습니다.");
      const { error } = await supabase.from("approval_records").update({ status: "withdrawn", completed_at: new Date().toISOString() }).eq("id", item.workflowRecordId).eq("status", "in_progress");
      if (error) throw error;
      await logActivity({ module: item.module, action: "결재회수", targetType: "approval_records", targetId: item.workflowRecordId, targetName: item.title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals-pending-v2"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-my-requests-v2"] });
      toast.success("결재 요청을 회수했습니다.");
    },
    onError: (error: any) => toast.error(error.message || "회수하지 못했습니다."),
  });

  const openAction = (items: ApprovalItem[], decision: Decision) => {
    setComment("");
    setActionDialog({ open: true, decision, items });
  };

  const handleBulkApprove = () => {
    const items = filteredPending.filter((item) => selected.has(item.key));
    if (!items.length) return;
    if (new Set(items.map((item) => `${item.module}:${item.table}`)).size > 1) {
      toast.error("같은 업무 유형의 결재만 묶어서 승인할 수 있습니다.");
      return;
    }
    openAction(items, "approved");
  };

  const changeModuleFilter = (value: string) => {
    setModuleFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("module"); else next.set("module", value.toLowerCase());
    setSearchParams(next, { replace: true });
    setSelected(new Set());
  };

  const renderList = (items: ApprovalItem[], mode: "pending" | "my") => (
    <div className="space-y-2">
      {items.map((item) => {
        const meta = MODULE_META[item.module] || { label: item.module, icon: FileText, color: "border-l-gray-400" };
        const Icon = meta.icon;
        const selectedItem = selected.has(item.key);
        return (
          <article key={item.key} className={`border border-l-4 bg-card p-3 ${meta.color}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {mode === "pending" && item.actionable !== false ? (
                <Checkbox className="h-5 w-5" aria-label={`${item.title} 선택`} checked={selectedItem} onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(item.key); else next.delete(item.key);
                  setSelected(next);
                }} />
              ) : null}
              <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted sm:flex"><Icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{meta.label}</Badge>
                  {item.table === "approval_records" ? <Badge variant="secondary">결재선 {item.currentStep}/{item.totalSteps}</Badge> : null}
                  {item.dataIssue ? <Badge variant="outline" className="text-amber-700">연계 점검 필요</Badge> : null}
                  {item.lotType ? <Badge variant="outline">{LOT_TYPE_LABELS[item.lotType] || item.lotType}</Badge> : null}
                  {mode === "my" ? statusBadge(item.status) : null}
                </div>
                <h2 className="mt-1 truncate text-sm font-semibold">{item.title}</h2>
                {item.subtitle ? <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p> : null}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{item.requestDate ? new Date(item.requestDate).toLocaleDateString("ko-KR") : "일자 미지정"}</span>
                  {item.requester ? <span>요청자 {item.requester}</span> : null}
                  {item.refNumber ? <span className="font-mono">{item.refNumber}</span> : null}
                  {item.lotName ? <span>{item.lotName}</span> : null}
                  {item.documentNumber ? <button type="button" className="text-primary hover:underline" onClick={() => navigate(`/documents?search=${encodeURIComponent(item.documentNumber!)}`)}>{item.documentNumber}</button> : <span className="text-amber-700">문서 미연계</span>}
                </div>
              </div>
              {item.amount ? <strong className="whitespace-nowrap text-sm tabular-nums">{formatManWon(item.amount)}</strong> : null}
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {mode === "pending" && item.actionable !== false ? <>
                  <Button size="sm" className="min-h-11" onClick={() => openAction([item], "approved")}><Check className="mr-1 h-3.5 w-3.5" />승인</Button>
                  <Button size="sm" variant="outline" className="min-h-11 text-destructive" onClick={() => openAction([item], "rejected")}><X className="mr-1 h-3.5 w-3.5" />반려</Button>
                </> : item.dataIssue ? <Badge variant="outline" className="text-amber-700">{item.dataIssue}</Badge> : null}
                {item.link ? <Button size="icon" variant="outline" className="h-11 w-11" title="원업무 열기" aria-label={`${item.title} 원업무 열기`} onClick={() => navigate(item.link!)}><Eye className="h-3.5 w-3.5" /></Button> : <Badge variant="outline" className="text-amber-700">원업무 확인 필요</Badge>}
                {mode === "my" && item.status === "in_progress" && item.workflowRecordId ? <Button size="sm" variant="outline" onClick={() => withdrawMutation.mutate(item)} disabled={withdrawMutation.isPending}><RotateCcw className="mr-1 h-3.5 w-3.5" />회수</Button> : null}
              </div>
            </div>
          </article>
        );
      })}
      {!items.length ? <div className="border py-12 text-center text-sm text-muted-foreground">조건에 맞는 결재가 없습니다.</div> : null}
    </div>
  );

  const activeFailures = tab === "pending" ? pendingFailures : myFailures;
  const isLoading = tab === "pending" ? pendingQuery.isLoading : myRequestQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-bold">통합 결재함</h1><p className="mt-1 text-sm text-muted-foreground">제주시청 차량관리과 운영팀</p></div>
          {activeFailures.length ? <Badge variant="outline" className="text-amber-700">{activeFailures.join(", ")} 조회 실패</Badge> : null}
        </div>

        <section className="grid border sm:grid-cols-4" aria-label="결재 요약">
          <div className="p-4"><p className="text-xs text-muted-foreground">처리 가능 결재</p><strong className="text-xl tabular-nums">{actionableCount}건</strong></div>
          <div className="border-t p-4 sm:border-l sm:border-t-0"><p className="text-xs text-muted-foreground">결재 대기 금액</p><strong className="text-xl tabular-nums">{formatManWon(pendingAmount)}</strong></div>
          <button type="button" className={`border-t p-4 text-left sm:border-l sm:border-t-0 ${missingDocumentOnly ? "bg-amber-50" : "hover:bg-muted/40"}`} onClick={() => setMissingDocumentOnly((value) => !value)}><p className="text-xs text-muted-foreground">문서 미연계</p><strong className="text-xl tabular-nums">{unlinkedCount}건</strong></button>
          <div className="border-t p-4 sm:border-l sm:border-t-0"><p className="text-xs text-muted-foreground">연계 점검 필요</p><strong className="text-xl tabular-nums">{dataIssueCount}건</strong></div>
        </section>

        <div className="flex flex-wrap items-center gap-2 border p-2">
          <div className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="결재 검색" className="h-9 pl-8" placeholder="제목, 문서번호, 주차장, 요청자 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={moduleFilter} onValueChange={changeModuleFilter}><SelectTrigger aria-label="업무 모듈" className="h-9 w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 업무</SelectItem>{Object.entries(MODULE_META).filter(([code]) => activeModules.has(code)).map(([code, meta]) => <SelectItem key={code} value={code}>{meta.label}</SelectItem>)}</SelectContent></Select>
          <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger aria-label="주차장 형태" className="h-9 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem><SelectItem value="offstreet">노외주차장</SelectItem><SelectItem value="multilevel">주차빌딩</SelectItem><SelectItem value="onstreet">노상주차장</SelectItem></SelectContent></Select>
          <Select value={ageFilter} onValueChange={setAgeFilter}><SelectTrigger aria-label="요청 경과 기간" className="h-9 w-32"><CalendarClock className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 기간</SelectItem><SelectItem value="today">오늘</SelectItem><SelectItem value="7">7일 이내</SelectItem><SelectItem value="30">30일 이내</SelectItem><SelectItem value="over30">30일 초과</SelectItem></SelectContent></Select>
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}><SelectTrigger aria-label="결재 정렬" className="h-9 w-36"><ArrowDownUp className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="latest">최신 요청순</SelectItem><SelectItem value="oldest">오래된 요청순</SelectItem><SelectItem value="amount_desc">금액 높은순</SelectItem><SelectItem value="amount_asc">금액 낮은순</SelectItem><SelectItem value="title">제목순</SelectItem></SelectContent></Select>
          {(search || moduleFilter !== "all" || lotTypeFilter !== "all" || ageFilter !== "all" || missingDocumentOnly) ? <Button size="sm" variant="ghost" onClick={() => { setSearch(""); changeModuleFilter("all"); setLotTypeFilter("all"); setAgeFilter("all"); setMissingDocumentOnly(false); }}><X className="mr-1 h-3.5 w-3.5" />초기화</Button> : null}
        </div>

        <Tabs value={canApprove ? tab : "my"} onValueChange={(value) => { setTab(value); setSelected(new Set()); }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>{canApprove ? <TabsTrigger value="pending">결재 대기 ({pendingItems.length})</TabsTrigger> : null}<TabsTrigger value="my">내 요청 ({myRequests.length})</TabsTrigger></TabsList>
            {selected.size ? <Button size="sm" onClick={handleBulkApprove}><Check className="mr-1 h-4 w-4" />선택 일괄 승인 ({selected.size}건)</Button> : null}
          </div>
          {canApprove ? <TabsContent value="pending" className="mt-3">{isLoading ? <div className="border py-12 text-center text-sm text-muted-foreground">결재 자료 조회 중...</div> : renderList(filteredPending, "pending")}</TabsContent> : null}
          <TabsContent value="my" className="mt-3">{isLoading ? <div className="border py-12 text-center text-sm text-muted-foreground">결재 자료 조회 중...</div> : renderList(filteredMyRequests, "my")}</TabsContent>
        </Tabs>

        <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog((current) => ({ ...current, open }))}>
          <DialogContent>
            <DialogHeader><DialogTitle>{actionDialog.decision === "approved" ? "결재 승인" : "결재 반려"}</DialogTitle><DialogDescription>{actionDialog.items.length}건의 원업무와 문서 연계를 확인한 뒤 처리합니다.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="max-h-36 overflow-auto border p-2 text-sm">{actionDialog.items.map((item) => <div key={item.key} className="py-1">{item.title}{item.amount ? ` · ${formatManWon(item.amount)}` : ""}</div>)}</div>
              <div><label className="text-xs font-medium" htmlFor="approval-comment">결재 의견{actionDialog.decision === "rejected" ? " *" : ""}</label><Textarea id="approval-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={4} placeholder={actionDialog.decision === "rejected" ? "반려 사유와 보완할 내용을 입력하세요" : "검토 의견을 입력할 수 있습니다"} /></div>
              {actionDialog.items.some((item) => !item.documentNumber) ? <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />공식 문서번호가 연결되지 않은 건이 포함되어 있습니다.</div> : null}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setActionDialog({ open: false, decision: "approved", items: [] })}>취소</Button><Button variant={actionDialog.decision === "rejected" ? "destructive" : "default"} disabled={decisionMutation.isPending || (actionDialog.decision === "rejected" && !comment.trim())} onClick={() => decisionMutation.mutate({ items: actionDialog.items, decision: actionDialog.decision, note: comment.trim() })}>{decisionMutation.isPending ? "처리 중..." : actionDialog.decision === "approved" ? "승인" : "반려"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
