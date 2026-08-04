import { useCallback, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ArrowUpDown, Check, FileText, Plus, Search, X } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";

const TRANSFER_LABELS: Record<string, string> = {
  appropriation: "전용(동일 관)",
  use: "이용(관 간)",
  transfer: "이체(기관 간)",
  reserve: "예비비 사용",
  carry_forward: "이월(이관자료)",
};

const TRANSFER_COLORS: Record<string, string> = {
  appropriation: "bg-blue-100 text-blue-800",
  use: "bg-emerald-100 text-emerald-800",
  transfer: "bg-violet-100 text-violet-800",
  reserve: "bg-amber-100 text-amber-900",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "승인 대기",
  approved: "승인",
  executed: "집행 완료",
  rejected: "반려",
  cancelled: "취소",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  executed: "bg-teal-100 text-teal-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  appropriation: "동일 관 내 세부 예산 항목 사이의 금액 조정",
  use: "서로 다른 관 사이의 예산 사용 변경",
  transfer: "기관 또는 회계 단위 사이의 예산 이동",
  reserve: "예비비에서 사업 예산 항목으로 충당",
};

const initialForm = {
  transfer_type: "appropriation",
  from_item_id: "",
  to_item_id: "",
  amount: 0,
  reason: "",
  legal_basis: "",
  document_number: "",
  author_name: "",
};

export default function BudgetTransfers() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

  const { data: plans = [] } = useQuery({
    queryKey: ["budget-plans-year-transfer", year],
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

  const { data: items = [], refetch: refetchItems } = useQuery({
    queryKey: ["budget-items-for-transfer", year, plans.map((plan) => plan.id).join(",")],
    enabled: plans.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_items")
        .select("id, item_code, item_name, category_l1, category_l2, budget_type, allocated_amount, remaining_amount")
        .in("plan_id", plans.map((plan) => plan.id))
        .eq("is_summary", false)
        .eq("budget_type", "expenditure")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: records = [], refetch } = useQuery({
    queryKey: ["budget-transfers", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_transfers")
        .select("*")
        .eq("fiscal_year", year)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const fromItem = itemById.get(form.from_item_id);
  const toItem = itemById.get(form.to_item_id);
  const isSameItem = Boolean(form.from_item_id && form.from_item_id === form.to_item_id);
  const exceedsBalance = Boolean(fromItem && form.amount > Number(fromItem.remaining_amount || 0));
  const categoryMismatch = Boolean(
    form.transfer_type === "appropriation" &&
      fromItem &&
      toItem &&
      fromItem.category_l2 !== toItem.category_l2,
  );

  const getItemName = useCallback((itemId: string) => {
    const item = itemById.get(itemId);
    return item ? `[${item.item_code}] ${item.item_name}` : itemId;
  }, [itemById]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("ko-KR");
    const result = records.filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (typeFilter !== "all" && record.transfer_type !== typeFilter) return false;
      if (!keyword) return true;
      const haystack = [
        record.transfer_number,
        record.document_number,
        record.reason,
        record.legal_basis,
        getItemName(record.from_item_id),
        getItemName(record.to_item_id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko-KR");
      return haystack.includes(keyword);
    });

    return [...result].sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "amount_desc") return Number(b.amount) - Number(a.amount);
      if (sortBy === "amount_asc") return Number(a.amount) - Number(b.amount);
      if (sortBy === "number") return String(a.transfer_number).localeCompare(String(b.transfer_number), "ko-KR", { numeric: true });
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [records, search, sortBy, statusFilter, typeFilter, getItemName]);

  const resetCreateForm = () => setForm({ ...initialForm, author_name: profile?.name || "" });

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.from_item_id || !form.to_item_id || form.amount <= 0 || !form.reason.trim() || !form.document_number.trim()) {
      toast.error("감액 항목, 증액 항목, 금액, 사유, 문서번호를 모두 입력해 주세요.");
      return;
    }
    if (isSameItem) {
      toast.error("감액 항목과 증액 항목은 서로 달라야 합니다.");
      return;
    }
    if (exceedsBalance) {
      toast.error("이동 금액이 감액 항목의 가용 잔액을 초과합니다.");
      return;
    }
    if (categoryMismatch) {
      toast.error("전용은 동일한 관 내의 예산 항목 사이에서만 신청할 수 있습니다.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await (supabase as any).rpc("create_budget_transfer", {
      p_fiscal_year: year,
      p_transfer_type: form.transfer_type,
      p_from_item_id: form.from_item_id,
      p_to_item_id: form.to_item_id,
      p_amount: form.amount,
      p_reason: form.reason.trim(),
      p_legal_basis: form.legal_basis.trim(),
      p_document_number: form.document_number.trim(),
      p_author_name: form.author_name.trim(),
      p_client_mutation_id: crypto.randomUUID(),
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const created = Array.isArray(data) ? data[0] : data;
    toast.success("예산 전용·이체 신청이 등록되었습니다.");
    await logActivity({
      module: "BUDGET",
      action: "예산 전용·이체 신청",
      targetType: "budget_transfers",
      targetName: created?.transfer_number || form.document_number.trim(),
    });
    setCreateOpen(false);
    resetCreateForm();
    await refetch();
  };

  const handleDecision = async (decision: "executed" | "rejected") => {
    if (!detailItem) return;
    if (detailItem.requested_by === profile?.id) {
      toast.error("본인이 신청한 전용·이체 건은 승인하거나 반려할 수 없습니다.");
      return;
    }
    if (decision === "rejected" && !rejectReason.trim()) {
      toast.error("반려 사유를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    const { error } = await (supabase as any).rpc("decide_budget_transfer", {
      p_transfer_id: detailItem.id,
      p_decision: decision,
      p_reason: decision === "rejected" ? rejectReason.trim() : "",
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(decision === "executed" ? "승인 및 예산 반영이 완료되었습니다." : "반려 처리가 완료되었습니다.");
    await logActivity({
      module: "BUDGET",
      action: decision === "executed" ? "예산 전용·이체 승인" : "예산 전용·이체 반려",
      targetType: "budget_transfers",
      targetName: detailItem.transfer_number,
    });
    setDetailItem(null);
    setRejectMode(false);
    setRejectReason("");
    await Promise.all([refetch(), refetchItems()]);
  };

  const openDetail = (record: any) => {
    setDetailItem(record);
    setRejectMode(false);
    setRejectReason("");
  };

  const closeDetail = () => {
    setDetailItem(null);
    setRejectMode(false);
    setRejectReason("");
  };

  const fmtNum = (value: number) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
  const fmtDate = (value?: string) => value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value)) : "-";
  const canApprove = Boolean(profile && ["admin", "manager"].includes(profile.role));
  const isOwnRequest = Boolean(detailItem && detailItem.requested_by === profile?.id);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">예산 전용·이체</h1>
            <p className="mt-1 text-sm text-muted-foreground">공식 문서를 근거로 예산 항목 간 금액 이동을 신청하고 승인합니다.</p>
          </div>
          <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />전용·이체 신청</Button>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_110px_140px_140px_170px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이동번호, 문서번호, 항목, 사유 검색"
              className="pl-9"
            />
          </div>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[currentYear + 1, currentYear, currentYear - 1].map((value) => <SelectItem key={value} value={String(value)}>{value}년</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="유형" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {Object.entries(TRANSFER_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger><ArrowUpDown className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">최근 등록순</SelectItem>
              <SelectItem value="oldest">오래된 등록순</SelectItem>
              <SelectItem value="amount_desc">금액 높은순</SelectItem>
              <SelectItem value="amount_asc">금액 낮은순</SelectItem>
              <SelectItem value="number">이동번호순</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>조회 {filteredRecords.length.toLocaleString("ko-KR")}건</span>
          <span>금액 합계 {fmtNum(filteredRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0))}</span>
        </div>

        <Card className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이동번호 / 문서번호</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>감액 항목</TableHead>
                  <TableHead className="w-10" />
                  <TableHead>증액 항목</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>신청일</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.id} className="cursor-pointer" onClick={() => openDetail(record)}>
                    <TableCell>
                      <p className="font-mono text-sm font-medium">{record.transfer_number}</p>
                      <p className="mt-0.5 max-w-[210px] truncate text-xs text-muted-foreground">{record.document_number || "문서번호 없음"}</p>
                    </TableCell>
                    <TableCell><Badge className={TRANSFER_COLORS[record.transfer_type]}>{TRANSFER_LABELS[record.transfer_type] || record.transfer_type}</Badge></TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm">{getItemName(record.from_item_id)}</TableCell>
                    <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm">{getItemName(record.to_item_id)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtNum(record.amount)}</TableCell>
                    <TableCell className="text-sm">{fmtDate(record.created_at)}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[record.status] || STATUS_COLORS.cancelled}>{STATUS_LABELS[record.status] || record.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {filteredRecords.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">조건에 맞는 전용·이체 내역이 없습니다.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:hidden">
          {filteredRecords.map((record) => (
            <Card key={record.id} className="cursor-pointer" onClick={() => openDetail(record)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{record.transfer_number}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{record.document_number || "문서번호 없음"}</p>
                  </div>
                  <Badge className={STATUS_COLORS[record.status] || STATUS_COLORS.cancelled}>{STATUS_LABELS[record.status] || record.status}</Badge>
                </div>
                <Badge className={TRANSFER_COLORS[record.transfer_type]}>{TRANSFER_LABELS[record.transfer_type] || record.transfer_type}</Badge>
                <div className="space-y-1 text-sm">
                  <p className="truncate"><span className="text-muted-foreground">감액</span> {getItemName(record.from_item_id)}</p>
                  <p className="truncate"><span className="text-muted-foreground">증액</span> {getItemName(record.to_item_id)}</p>
                </div>
                <div className="flex items-end justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">{fmtDate(record.created_at)}</span>
                  <span className="font-semibold">{fmtNum(record.amount)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredRecords.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">조건에 맞는 전용·이체 내역이 없습니다.</div>}
        </div>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader><DialogTitle>예산 전용·이체 신청</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>이동 유형 *</Label>
                <Select value={form.transfer_type} onValueChange={(value) => setForm((current) => ({ ...current, transfer_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TRANSFER_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[form.transfer_type]}</p>
              </div>

              <div className="space-y-1.5">
                <Label>감액 항목 *</Label>
                <Select value={form.from_item_id} onValueChange={(value) => setForm((current) => ({ ...current, from_item_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="감액할 예산 항목 선택" /></SelectTrigger>
                  <SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>[{item.item_code}] {item.item_name}</SelectItem>)}</SelectContent>
                </Select>
                {fromItem && <p className="text-xs text-muted-foreground">배정 {fmtNum(fromItem.allocated_amount)} · 가용 잔액 {fmtNum(fromItem.remaining_amount)}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>증액 항목 *</Label>
                <Select value={form.to_item_id} onValueChange={(value) => setForm((current) => ({ ...current, to_item_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="증액할 예산 항목 선택" /></SelectTrigger>
                  <SelectContent>{items.filter((item) => item.id !== form.from_item_id).map((item) => <SelectItem key={item.id} value={item.id}>[{item.item_code}] {item.item_name}</SelectItem>)}</SelectContent>
                </Select>
                {toItem && <p className="text-xs text-muted-foreground">현재 배정 {fmtNum(toItem.allocated_amount)}</p>}
              </div>

              {(isSameItem || exceedsBalance || categoryMismatch) && (
                <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {isSameItem && "감액 항목과 증액 항목은 서로 달라야 합니다."}
                    {!isSameItem && exceedsBalance && "이동 금액이 감액 항목의 가용 잔액을 초과합니다."}
                    {!isSameItem && !exceedsBalance && categoryMismatch && "전용은 동일한 관 내의 예산 항목 사이에서만 신청할 수 있습니다."}
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="transfer-amount">이동 금액 *</Label>
                <Input id="transfer-amount" type="number" min={1} max={Number(fromItem?.remaining_amount || undefined)} value={form.amount || ""} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-document">근거 문서번호 *</Label>
                <Input id="transfer-document" value={form.document_number} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} placeholder="예: 제주시청-차량관리과-2026-0803" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-reason">이동 사유 *</Label>
                <Textarea id="transfer-reason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="사업 변경 사유와 필요성을 구체적으로 입력" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-basis">법령·지침 근거</Label>
                <Input id="transfer-basis" value={form.legal_basis} onChange={(event) => setForm((current) => ({ ...current, legal_basis: event.target.value }))} placeholder="예: 지방재정법 제49조" />
              </div>
              <AuthorField value={form.author_name} onChange={(value) => setForm((current) => ({ ...current, author_name: value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>취소</Button>
              <Button onClick={handleCreate} disabled={submitting || isSameItem || exceedsBalance || categoryMismatch}>{submitting ? "등록 중..." : "승인 요청"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(detailItem)} onOpenChange={(open) => { if (!open) closeDetail(); }}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>전용·이체 상세 {detailItem?.transfer_number}</DialogTitle></DialogHeader>
            {detailItem && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge className={TRANSFER_COLORS[detailItem.transfer_type]}>{TRANSFER_LABELS[detailItem.transfer_type] || detailItem.transfer_type}</Badge>
                  <Badge className={STATUS_COLORS[detailItem.status] || STATUS_COLORS.cancelled}>{STATUS_LABELS[detailItem.status] || detailItem.status}</Badge>
                </div>

                <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">감액 항목</p>
                    <p className="mt-1 text-sm font-medium">{getItemName(detailItem.from_item_id)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">증액 항목</p>
                    <p className="mt-1 text-sm font-medium">{getItemName(detailItem.to_item_id)}</p>
                  </div>
                </div>

                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">이동 금액</dt><dd className="mt-1 text-base font-semibold">{fmtNum(detailItem.amount)}</dd></div>
                  <div><dt className="text-muted-foreground">신청일</dt><dd className="mt-1">{fmtDate(detailItem.created_at)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">근거 문서번호</dt><dd className="mt-1 flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />{detailItem.document_number || "미등록"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">이동 사유</dt><dd className="mt-1 whitespace-pre-wrap">{detailItem.reason}</dd></div>
                  {detailItem.legal_basis && <div className="sm:col-span-2"><dt className="text-muted-foreground">법령·지침 근거</dt><dd className="mt-1">{detailItem.legal_basis}</dd></div>}
                  {detailItem.reject_reason && <div className="rounded-md bg-red-50 p-3 sm:col-span-2"><dt className="font-medium text-red-800">반려 사유</dt><dd className="mt-1 whitespace-pre-wrap text-red-700">{detailItem.reject_reason}</dd></div>}
                </dl>

                {canApprove && detailItem.status === "pending" && isOwnRequest && (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>본인이 신청한 건은 업무분리 원칙에 따라 승인하거나 반려할 수 없습니다. 다른 결재권자에게 검토를 요청하세요.</span>
                  </div>
                )}

                {canApprove && detailItem.status === "pending" && !isOwnRequest && rejectMode && (
                  <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-4">
                    <Label htmlFor="transfer-reject-reason" className="text-red-900">반려 사유 *</Label>
                    <Textarea id="transfer-reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="신청자가 보완할 수 있도록 구체적으로 입력" className="bg-white" />
                  </div>
                )}

                {canApprove && detailItem.status === "pending" && !isOwnRequest && (
                  <DialogFooter className="gap-2 sm:gap-0">
                    {rejectMode ? (
                      <>
                        <Button variant="outline" onClick={() => { setRejectMode(false); setRejectReason(""); }} disabled={submitting}>반려 취소</Button>
                        <Button variant="destructive" onClick={() => handleDecision("rejected")} disabled={submitting || !rejectReason.trim()}><X className="mr-1 h-4 w-4" />반려 확정</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="destructive" onClick={() => setRejectMode(true)} disabled={submitting}><X className="mr-1 h-4 w-4" />반려</Button>
                        <Button onClick={() => handleDecision("executed")} disabled={submitting}><Check className="mr-1 h-4 w-4" />승인 및 반영</Button>
                      </>
                    )}
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
