import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Check, FileText, MapPin, Plus, Search, X } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";

type LotType = "offstreet" | "multilevel" | "onstreet" | string;
type Decision = "executed" | "rejected";
type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "number" | "lot" | "status";

type ParkingLot = {
  id: string;
  code: string;
  name: string;
  lot_type: LotType | null;
};

type BudgetItemRow = {
  id: string;
  lot_id: string | null;
  item_code: string;
  item_name: string;
  category_l1: string;
  budget_type: string;
  allocated_amount: number;
  executed_amount: number;
  remaining_amount: number;
  parking_lots: Omit<ParkingLot, "id"> | null;
};

type ExecutionRow = {
  id: string;
  execution_number: string;
  execution_date: string;
  execution_type: string;
  amount: number;
  vendor_name: string | null;
  description: string;
  document_number: string | null;
  status: string;
  requested_by: string | null;
  reject_reason: string | null;
  budget_items: { item_code: string; item_name: string; category_l1: string } | null;
  parking_lots: Omit<ParkingLot, "id"> | null;
};

type ExecutionForm = {
  item_id: string;
  lot_id: string;
  execution_type: string;
  execution_date: string;
  amount: number;
  vendor_name: string;
  description: string;
  document_number: string;
  payment_method: string;
  notes: string;
  author_name: string;
};

const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장",
  multilevel: "주차빌딩",
  onstreet: "노상주차장",
};

const EXECUTION_TYPE_LABELS: Record<string, string> = {
  expenditure: "지출",
  revenue_collection: "수입 징수",
  transfer_in: "전입",
  transfer_out: "전출",
  return: "반납",
  carry_forward: "이월",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "승인 대기",
  approved: "승인",
  executed: "집행 완료",
  rejected: "반려",
  cancelled: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  executed: "border-teal-200 bg-teal-50 text-teal-800",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "계좌이체",
  card: "카드",
  cash: "현금",
  check: "수표",
  offset: "상계",
};

const localToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const emptyForm = (): ExecutionForm => ({
  item_id: "",
  lot_id: "",
  execution_type: "expenditure",
  execution_date: localToday(),
  amount: 0,
  vendor_name: "",
  description: "",
  document_number: "",
  payment_method: "bank_transfer",
  notes: "",
  author_name: "",
});

const formatAmount = (amount: number | null | undefined) => `${Number(amount || 0).toLocaleString("ko-KR")}원`;

export default function BudgetExecutions() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ExecutionForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ExecutionRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: plans = [] } = useQuery({
    queryKey: ["budget-plans-year", year, "executable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_plans")
        .select("id")
        .eq("fiscal_year", year)
        .in("status", ["approved", "executed"]);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["budget-items-for-exec", year, plans.map((plan) => plan.id).join(",")],
    enabled: plans.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_items")
        .select("id, lot_id, item_code, item_name, category_l1, budget_type, allocated_amount, executed_amount, remaining_amount, parking_lots(code, name, lot_type)")
        .in("plan_id", plans.map((plan) => plan.id))
        .eq("is_summary", false)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as BudgetItemRow[];
    },
  });

  const { data: lots = [] } = useQuery({
    queryKey: ["budget-execution-parking-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parking_lots")
        .select("id, code, name, lot_type")
        .eq("status", "active")
        .order("code");
      if (error) throw error;
      return (data || []) as ParkingLot[];
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["budget-executions", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_executions")
        .select("*, budget_items(item_code, item_name, category_l1), parking_lots(code, name, lot_type)")
        .gte("execution_date", `${year}-01-01`)
        .lte("execution_date", `${year}-12-31`);
      if (error) throw error;
      return (data || []) as unknown as ExecutionRow[];
    },
  });

  const selectedItem = items.find((item) => item.id === form.item_id);
  const selectedLot = lots.find((lot) => lot.id === form.lot_id);
  const compatibleItems = items.filter((item) => {
    if (form.execution_type === "revenue_collection") return item.budget_type === "revenue";
    if (form.execution_type === "expenditure") return item.budget_type === "expenditure";
    return true;
  });
  const amountExceedsBalance = Boolean(
    selectedItem && form.execution_type === "expenditure" && form.amount > Number(selectedItem.remaining_amount || 0),
  );

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ko-KR");
    const next = records.filter((record) => {
      if (typeFilter !== "all" && record.execution_type !== typeFilter) return false;
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (lotTypeFilter !== "all" && record.parking_lots?.lot_type !== lotTypeFilter) return false;
      if (!term) return true;
      return [
        record.execution_number,
        record.document_number,
        record.description,
        record.vendor_name,
        record.budget_items?.item_code,
        record.budget_items?.item_name,
        record.parking_lots?.code,
        record.parking_lots?.name,
      ].some((value) => value?.toLocaleLowerCase("ko-KR").includes(term));
    });

    return next.sort((a, b) => {
      if (sortKey === "date_asc") return a.execution_date.localeCompare(b.execution_date) || a.execution_number.localeCompare(b.execution_number);
      if (sortKey === "amount_desc") return b.amount - a.amount;
      if (sortKey === "amount_asc") return a.amount - b.amount;
      if (sortKey === "number") return a.execution_number.localeCompare(b.execution_number, "ko-KR", { numeric: true });
      if (sortKey === "lot") return (a.parking_lots?.name || "").localeCompare(b.parking_lots?.name || "", "ko-KR");
      if (sortKey === "status") return (STATUS_LABELS[a.status] || a.status).localeCompare(STATUS_LABELS[b.status] || b.status, "ko-KR");
      return b.execution_date.localeCompare(a.execution_date) || b.execution_number.localeCompare(a.execution_number);
    });
  }, [lotTypeFilter, records, search, sortKey, statusFilter, typeFilter]);

  const executedTotal = filteredRecords
    .filter((record) => record.status === "executed")
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const pendingRecords = filteredRecords.filter((record) => record.status === "pending");
  const pendingTotal = pendingRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const canApprove = Boolean(profile && ["admin", "manager"].includes(profile.role));

  const resetForm = () => setForm(emptyForm());

  const handleItemChange = (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    setForm((current) => ({ ...current, item_id: itemId, lot_id: item?.lot_id || current.lot_id }));
  };

  const handleCreate = async () => {
    if (!profile?.id) return toast.error("로그인 정보를 확인할 수 없습니다.");
    if (!selectedItem) return toast.error("집행할 예산 항목을 선택해 주세요.");
    if (!form.lot_id) return toast.error("관련 주차장을 선택해 주세요.");
    if (!form.execution_date) return toast.error("집행일을 입력해 주세요.");
    if (!Number.isFinite(form.amount) || form.amount <= 0) return toast.error("금액은 0원보다 크게 입력해 주세요.");
    if (amountExceedsBalance) return toast.error(`집행 가능 잔액 ${formatAmount(selectedItem.remaining_amount)}을 초과했습니다.`);
    if (!form.description.trim()) return toast.error("집행 내용을 입력해 주세요.");
    if (!form.document_number.trim()) return toast.error("지출결의서 문서번호를 입력해 주세요.");
    if (selectedItem.lot_id && selectedItem.lot_id !== form.lot_id) return toast.error("예산 항목에 지정된 주차장과 일치하지 않습니다.");

    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_budget_execution", {
        p_item_id: form.item_id,
        p_lot_id: form.lot_id,
        p_execution_date: form.execution_date,
        p_amount: form.amount,
        p_execution_type: form.execution_type,
        p_vendor_name: form.vendor_name.trim() || null,
        p_description: form.description.trim(),
        p_document_number: form.document_number.trim(),
        p_payment_method: form.payment_method,
        p_notes: form.notes.trim() || null,
        p_author_name: form.author_name.trim() || null,
        p_client_mutation_id: crypto.randomUUID(),
      });
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] : data;
      toast.success("예산 집행 승인 요청을 등록했습니다.");
      await logActivity({
        module: "BUDGET",
        action: "예산 집행 등록",
        targetType: "budget_executions",
        targetId: created?.id,
        targetName: created?.execution_number || form.document_number.trim(),
        details: { lot_id: form.lot_id, document_number: form.document_number.trim(), amount: form.amount },
      });
      setCreateOpen(false);
      resetForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["budget-executions"] }),
        queryClient.invalidateQueries({ queryKey: ["budget-items-for-exec"] }),
      ]);
    } catch (error: any) {
      toast.error(error?.message || "집행 등록 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (record: ExecutionRow, decision: Decision, reason = "") => {
    if (record.requested_by === profile?.id) return toast.error("본인이 신청한 집행은 직접 승인하거나 반려할 수 없습니다.");
    if (decision === "rejected" && !reason.trim()) return toast.error("반려 사유를 입력해 주세요.");

    setProcessingId(record.id);
    try {
      const { error } = await (supabase as any).rpc("decide_budget_execution", {
        p_execution_id: record.id,
        p_decision: decision,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success(decision === "executed" ? "집행 승인을 완료했습니다." : "집행 요청을 반려했습니다.");
      await logActivity({
        module: "BUDGET",
        action: decision === "executed" ? "예산 집행 승인" : "예산 집행 반려",
        targetType: "budget_executions",
        targetId: record.id,
        targetName: record.execution_number,
        details: decision === "rejected" ? { reason: reason.trim() } : undefined,
      });
      setRejectTarget(null);
      setRejectReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["budget-executions"] }),
        queryClient.invalidateQueries({ queryKey: ["budget-items-for-exec"] }),
      ]);
    } catch (error: any) {
      toast.error(error?.message || "승인 처리 중 오류가 발생했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const approvalActions = (record: ExecutionRow) => {
    if (!canApprove || record.status !== "pending") return null;
    if (record.requested_by === profile?.id) {
      return <span className="text-xs font-medium text-amber-700">본인 신청 · 승인 불가</span>;
    }
    const processing = processingId === record.id;
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-8" disabled={processing} onClick={() => handleDecision(record, "executed")}>
          <Check className="mr-1 h-3.5 w-3.5" />승인
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-red-700" disabled={processing} onClick={() => { setRejectTarget(record); setRejectReason(""); }}>
          <X className="mr-1 h-3.5 w-3.5" />반려
        </Button>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">예산 집행</h1>
            <p className="mt-1 text-sm text-muted-foreground">지출결의서 문서번호와 주차장을 연결해 신청부터 승인까지 관리합니다.</p>
          </div>
          <Button onClick={() => { resetForm(); setCreateOpen(true); }}><Plus className="mr-1 h-4 w-4" />집행 등록</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">조회 결과</p><p className="mt-1 text-xl font-semibold">{filteredRecords.length.toLocaleString()}건</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">집행 완료액</p><p className="mt-1 text-xl font-semibold text-teal-700">{formatAmount(executedTotal)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">승인 대기</p><p className="mt-1 text-xl font-semibold text-amber-700">{pendingRecords.length.toLocaleString()}건</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">승인 대기액</p><p className="mt-1 text-xl font-semibold">{formatAmount(pendingTotal)}</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="집행번호, 문서번호, 예산항목, 주차장, 거래처, 내용 검색" />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger aria-label="회계연도" className="lg:w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((value) => <SelectItem key={value} value={String(value)}>{value}년</SelectItem>)}</SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger aria-label="집행 유형" className="lg:w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 유형</SelectItem>{Object.entries(EXECUTION_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="처리 상태" className="lg:w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 상태</SelectItem>{Object.entries(STATUS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
                <SelectTrigger aria-label="주차장 형태" className="lg:w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 주차장 형태</SelectItem>{Object.entries(LOT_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <SelectTrigger aria-label="정렬 방식" className="col-span-2 lg:w-40"><ArrowDownUp className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">집행일 최신순</SelectItem><SelectItem value="date_asc">집행일 오래된순</SelectItem>
                  <SelectItem value="amount_desc">금액 높은순</SelectItem><SelectItem value="amount_asc">금액 낮은순</SelectItem>
                  <SelectItem value="number">집행번호순</SelectItem><SelectItem value="lot">주차장명순</SelectItem><SelectItem value="status">상태순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>집행번호 / 문서번호</TableHead><TableHead>집행일</TableHead><TableHead>유형</TableHead><TableHead>예산항목</TableHead>
                  <TableHead>주차장</TableHead><TableHead>거래처 / 내용</TableHead><TableHead className="text-right">금액</TableHead><TableHead>상태</TableHead>{canApprove && <TableHead>처리</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => <TableRow key={record.id}>
                    <TableCell><p className="font-mono text-xs font-medium">{record.execution_number}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" />{record.document_number || "문서번호 없음"}</p></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{record.execution_date}</TableCell>
                    <TableCell><Badge variant="outline" className="whitespace-nowrap text-xs">{EXECUTION_TYPE_LABELS[record.execution_type] || record.execution_type}</Badge></TableCell>
                    <TableCell className="min-w-44 text-sm"><p>{record.budget_items?.item_name || "-"}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{record.budget_items?.item_code || "-"} · {record.budget_items?.category_l1 || "-"}</p></TableCell>
                    <TableCell className="min-w-36 text-sm"><p>{record.parking_lots?.name || "미지정"}</p>{record.parking_lots?.lot_type && <Badge variant="secondary" className="mt-1 text-[10px]">{LOT_TYPE_LABELS[record.parking_lots.lot_type] || "기타"}</Badge>}</TableCell>
                    <TableCell className="max-w-56 text-sm"><p>{record.vendor_name || "-"}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={record.description}>{record.description}</p></TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{formatAmount(record.amount)}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_COLORS[record.status] || ""}>{STATUS_LABELS[record.status] || record.status}</Badge>{record.status === "rejected" && record.reject_reason && <p className="mt-1 max-w-36 text-xs text-red-700">{record.reject_reason}</p>}</TableCell>
                    {canApprove && <TableCell>{approvalActions(record)}</TableCell>}
                  </TableRow>)}
                  {!filteredRecords.length && <TableRow><TableCell colSpan={canApprove ? 9 : 8} className="h-32 text-center text-muted-foreground">조건에 맞는 예산 집행 내역이 없습니다.</TableCell></TableRow>}
                </TableBody>
                <TableFooter><TableRow><TableCell colSpan={6}>조회 결과 중 집행 완료 합계</TableCell><TableCell className="text-right text-primary">{formatAmount(executedTotal)}</TableCell><TableCell colSpan={canApprove ? 2 : 1} /></TableRow></TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 md:hidden">
          {filteredRecords.map((record) => <Card key={record.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs font-semibold">{record.execution_number}</p><p className="mt-1 text-xs text-muted-foreground">{record.execution_date} · {EXECUTION_TYPE_LABELS[record.execution_type] || record.execution_type}</p></div><Badge variant="outline" className={STATUS_COLORS[record.status] || ""}>{STATUS_LABELS[record.status] || record.status}</Badge></div>
              <div><p className="text-sm font-medium">{record.budget_items?.item_name || "예산항목 미지정"}</p><p className="mt-1 text-xl font-semibold">{formatAmount(record.amount)}</p></div>
              <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{record.parking_lots?.name || "주차장 미지정"}{record.parking_lots?.lot_type ? ` · ${LOT_TYPE_LABELS[record.parking_lots.lot_type] || "기타"}` : ""}</p>
                <p className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{record.document_number || "문서번호 없음"}</p>
                <p>{record.vendor_name || "거래처 미입력"} · {record.description}</p>
                {record.status === "rejected" && record.reject_reason && <p className="text-red-700">반려 사유: {record.reject_reason}</p>}
              </div>
              {approvalActions(record)}
            </CardContent>
          </Card>)}
          {!filteredRecords.length && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 예산 집행 내역이 없습니다.</CardContent></Card>}
        </div>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader><DialogTitle>예산 집행 등록</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>예산항목 *</Label><Select value={form.item_id} onValueChange={handleItemChange}><SelectTrigger><SelectValue placeholder="승인된 예산항목 선택" /></SelectTrigger><SelectContent>{compatibleItems.map((item) => <SelectItem key={item.id} value={item.id}>[{item.item_code}] {item.item_name} · 잔액 {formatAmount(item.remaining_amount)}</SelectItem>)}</SelectContent></Select>{!compatibleItems.length && <p className="mt-1 text-xs text-amber-700">{year}년에 이 집행 유형과 맞는 승인 예산항목이 없습니다.</p>}{selectedItem && <div className="mt-2 rounded border bg-muted/30 p-2 text-xs"><p>배정 {formatAmount(selectedItem.allocated_amount)} · 집행 {formatAmount(selectedItem.executed_amount)} · <strong>잔액 {formatAmount(selectedItem.remaining_amount)}</strong></p>{selectedItem.parking_lots && <p className="mt-1">지정 주차장: {selectedItem.parking_lots.name} · {LOT_TYPE_LABELS[selectedItem.parking_lots.lot_type || ""] || "기타"}</p>}</div>}</div>
              <div><Label>관련 주차장 *</Label><Select value={form.lot_id} onValueChange={(value) => setForm((current) => ({ ...current, lot_id: value }))} disabled={Boolean(selectedItem?.lot_id)}><SelectTrigger><SelectValue placeholder="주차장 선택" /></SelectTrigger><SelectContent>{lots.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.code} {lot.name} · {LOT_TYPE_LABELS[lot.lot_type || ""] || "기타"}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">예산항목에 주차장이 지정되어 있으면 자동으로 연결됩니다.</p></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label>집행 유형 *</Label><Select value={form.execution_type} onValueChange={(value) => setForm((current) => ({ ...current, execution_type: value, item_id: "", lot_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(EXECUTION_TYPE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>집행일 *</Label><Input type="date" value={form.execution_date} onChange={(event) => setForm((current) => ({ ...current, execution_date: event.target.value }))} /></div></div>
              <div><Label>금액 *</Label><Input type="number" min={1} step={1000} value={form.amount || ""} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) || 0 }))} aria-invalid={amountExceedsBalance} />{amountExceedsBalance && <p className="mt-1 text-xs font-medium text-red-600">집행 가능 잔액 {formatAmount(selectedItem?.remaining_amount)}을 초과했습니다.</p>}</div>
              <div><Label>거래처·업체명</Label><Input value={form.vendor_name} onChange={(event) => setForm((current) => ({ ...current, vendor_name: event.target.value }))} placeholder="예: 제주안전시설 주식회사" /></div>
              <div><Label>집행 내용 *</Label><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="지출 목적과 주요 내용을 입력하세요." /></div>
              <div><Label>지출결의서 문서번호 *</Label><Input value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} placeholder="예: 제주시청-차량관리과-2026-0803-BE01" /><p className="mt-1 text-xs text-muted-foreground">중복 문서번호는 등록되지 않습니다.</p></div>
              <div><Label>지급 방법</Label><Select value={form.payment_method} onValueChange={(value) => setForm((current) => ({ ...current, payment_method: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>비고</Label><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="증빙, 계약 또는 현장 확인사항" /></div>
              <AuthorField value={form.author_name} onChange={(value) => setForm((current) => ({ ...current, author_name: value }))} />
              {selectedLot && <p className="rounded border bg-muted/30 p-2 text-xs">연결 대상: {selectedLot.name} · {LOT_TYPE_LABELS[selectedLot.lot_type || ""] || "기타 주차장"}</p>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>취소</Button><Button onClick={handleCreate} disabled={saving || amountExceedsBalance}>{saving ? "등록 중..." : "승인 요청"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectReason(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>집행 요청 반려</DialogTitle></DialogHeader>
            <div className="space-y-3"><p className="text-sm text-muted-foreground">{rejectTarget?.execution_number} 요청을 반려하는 사유를 기록합니다.</p><div><Label>반려 사유 *</Label><Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="보완이 필요한 내용과 재신청 기준을 구체적으로 입력하세요." /></div></div>
            <DialogFooter><Button variant="outline" onClick={() => setRejectTarget(null)}>취소</Button><Button variant="destructive" disabled={!rejectReason.trim() || processingId === rejectTarget?.id} onClick={() => rejectTarget && handleDecision(rejectTarget, "rejected", rejectReason)}>반려 확정</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
