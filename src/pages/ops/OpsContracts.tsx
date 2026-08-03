import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from "@/types/operations";
import { Plus, Search, RotateCcw } from "lucide-react";
import { LOT_TYPE_LABELS } from "@/types/database";
import { AuthorField } from "@/components/common/AuthorField";

export default function OpsContractsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const search = searchParams.get("q") || "";
  const lotTypeFilter = searchParams.get("lotType") || "all";
  const sortBy = searchParams.get("sort") || "end_soon";

  const setParam = (key: string, value: string, defaultValue = "") => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key); else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const { data: contracts, error: contractsError } = useQuery({ queryKey: ["ops-contracts-list"], queryFn: async () => {
    const { data, error } = await supabase.from("outsourcing_contracts").select("*, parking_lots(code, name, lot_type)").order("contract_end", { ascending: true });
    if (error) throw error;
    return data || [];
  }});

  const { data: lots, error: lotsError } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
    if (error) throw error;
    return data || [];
  }});

  const requestedFilter = searchParams.get("filter");
  const validFilters = new Set(["all", "expiring", ...Object.keys(CONTRACT_STATUS_LABELS)]);
  const statusFilter = requestedFilter && validFilters.has(requestedFilter) ? requestedFilter : "all";
  const setStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("filter");
    else next.set("filter", value);
    setSearchParams(next, { replace: true });
  };

  const now = new Date();
  const d30 = new Date(); d30.setDate(d30.getDate() + 30);

  const filtered = (contracts || []).filter((c: any) => {
    if (statusFilter === "expiring" && !(c.status === "active" && new Date(c.contract_end) <= d30)) return false;
    if (statusFilter !== "all" && statusFilter !== "expiring" && c.status !== statusFilter) return false;
    if (lotTypeFilter !== "all" && c.parking_lots?.lot_type !== lotTypeFilter) return false;
    if (search) {
      const haystack = `${c.company_name} ${c.contract_number || ""} ${c.contact_person || ""} ${c.parking_lots?.name || ""} ${c.document_number || ""}`.toLocaleLowerCase("ko");
      if (!haystack.includes(search.toLocaleLowerCase("ko"))) return false;
    }
    return true;
  }).sort((a: any, b: any) => {
    if (sortBy === "end_late") return b.contract_end.localeCompare(a.contract_end);
    if (sortBy === "amount_high") return (b.contract_amount || 0) - (a.contract_amount || 0);
    if (sortBy === "score_high") return (b.performance_score || 0) - (a.performance_score || 0);
    if (sortBy === "company") return a.company_name.localeCompare(b.company_name, "ko");
    if (sortBy === "lot") return (a.parking_lots?.name || "").localeCompare(b.parking_lots?.name || "", "ko");
    return a.contract_end.localeCompare(b.contract_end);
  });

  const openNew = () => {
    const start = new Date();
    const end = new Date(start); end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1);
    setEditing(null);
    setForm({ status: "active", auto_renew: false, contract_start: start.toISOString().slice(0, 10), contract_end: end.toISOString().slice(0, 10) });
    setDialogOpen(true);
  };
  const openEdit = (c: any) => { setEditing(c); setForm({ ...c }); setDialogOpen(true); };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.lot_id || !form.company_name || !form.contract_start || !form.contract_end) { toast({ title: "필수 입력을 확인하세요", variant: "destructive" }); return; }
    if (form.contract_end < form.contract_start) { toast({ title: "계약 종료일을 확인하세요", description: "종료일은 시작일보다 빠를 수 없습니다.", variant: "destructive" }); return; }
    if ((form.contract_amount || 0) < 0 || (form.monthly_fee || 0) < 0) { toast({ title: "계약금액을 확인하세요", variant: "destructive" }); return; }
    if ((form.revenue_share_rate || 0) < 0 || (form.revenue_share_rate || 0) > 100) { toast({ title: "수입배분율을 확인하세요", variant: "destructive" }); return; }
    if (form.performance_score != null && (form.performance_score < 0 || form.performance_score > 100)) { toast({ title: "성과평가 점수를 확인하세요", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, ...payload } = form;
      if (!editing) payload.created_by = user?.id;
      if (editing) {
        const { error } = await supabase.from("outsourcing_contracts").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logActivity({ module: "ops", action: "update", targetType: "contract", targetId: editing.id, targetName: form.company_name });
      } else {
        const { error } = await supabase.from("outsourcing_contracts").insert(payload);
        if (error) throw error;
        await logActivity({ module: "ops", action: "create", targetType: "contract", targetName: form.company_name });
      }
      toast({ title: "저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["ops-contracts-list"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const queryError = contractsError || lotsError;

  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">위탁 계약을 불러오지 못했습니다: {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">위탁 계약</h2>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 계약 등록</Button>
        </div>

        <Card><CardContent className="pt-4 pb-3"><div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" value={search} onChange={(e) => setParam("q", e.target.value)} placeholder="업체·계약번호·담당자·문서번호 검색" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {Object.entries(CONTRACT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            <SelectItem value="expiring">30일 이내 만료</SelectItem>
          </SelectContent></Select>
          <Select value={lotTypeFilter} onValueChange={(value) => setParam("lotType", value, "all")}><SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem><SelectItem value="offstreet">노외주차장</SelectItem><SelectItem value="multilevel">주차빌딩</SelectItem><SelectItem value="onstreet">노상주차장</SelectItem></SelectContent></Select>
          <Select value={sortBy} onValueChange={(value) => setParam("sort", value, "end_soon")}><SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="end_soon">종료일 임박순</SelectItem><SelectItem value="end_late">종료일 먼순</SelectItem><SelectItem value="amount_high">계약금액 높은순</SelectItem><SelectItem value="score_high">평가점수 높은순</SelectItem><SelectItem value="company">업체명순</SelectItem><SelectItem value="lot">주차장순</SelectItem></SelectContent></Select>
          <Button type="button" size="icon" variant="ghost" title="필터 초기화" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}><RotateCcw className="h-4 w-4" /></Button>
        </div></CardContent></Card>

        <Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>주차장</TableHead><TableHead>업체명</TableHead><TableHead>계약기간</TableHead>
            <TableHead className="text-right">계약금액</TableHead><TableHead className="text-right">월납입</TableHead>
            <TableHead>점수</TableHead><TableHead>상태</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">데이터 없음</TableCell></TableRow> :
            filtered.map((c: any) => {
              const expiring = c.status === "active" && new Date(c.contract_end) <= d30;
              return (
                <TableRow key={c.id} className={`cursor-pointer hover:bg-accent/50 ${expiring ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}`} onClick={() => openEdit(c)}>
                  <TableCell className="text-xs"><span className="block">{(c.parking_lots as any)?.name}</span><span className="text-[10px] text-muted-foreground">{LOT_TYPE_LABELS[(c.parking_lots as any)?.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</span></TableCell>
                  <TableCell className="text-sm font-medium">{c.company_name}</TableCell>
                  <TableCell className="text-xs">{c.contract_start} ~ {c.contract_end}</TableCell>
                  <TableCell className="text-xs text-right">{c.contract_amount?.toLocaleString() || "-"}</TableCell>
                  <TableCell className="text-xs text-right">{c.monthly_fee?.toLocaleString() || "-"}</TableCell>
                  <TableCell className="text-xs">{c.performance_score || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${CONTRACT_STATUS_COLORS[c.status] || ""}`}>{CONTRACT_STATUS_LABELS[c.status] || c.status}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table>
        </CardContent></Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "계약 수정" : "계약 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">주차장 *</Label>
              <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">업체명 *</Label><Input value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">사업자등록번호</Label><Input value={form.business_number || ""} onChange={e => set("business_number", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">대표자</Label><Input value={form.representative || ""} onChange={e => set("representative", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">계약번호</Label><Input value={form.contract_number || ""} onChange={e => set("contract_number", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">관련 공식 문서번호</Label><Input value={form.document_number || ""} onChange={e => set("document_number", e.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">시작일 *</Label><Input type="date" value={form.contract_start || ""} onChange={e => set("contract_start", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">종료일 *</Label><Input type="date" value={form.contract_end || ""} onChange={e => set("contract_end", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">계약금액(원)</Label><Input type="number" value={form.contract_amount || ""} onChange={e => set("contract_amount", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">월납입금(원)</Label><Input type="number" value={form.monthly_fee || ""} onChange={e => set("monthly_fee", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">수입배분(%)</Label><Input type="number" value={form.revenue_share_rate || ""} onChange={e => set("revenue_share_rate", Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">담당자</Label><Input value={form.contact_person || ""} onChange={e => set("contact_person", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">연락처</Label><Input value={form.contact_phone || ""} onChange={e => set("contact_phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">이메일</Label><Input value={form.contact_email || ""} onChange={e => set("contact_email", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">성과평가 점수 (0~100)</Label><Input type="number" min={0} max={100} step={0.1} value={form.performance_score || ""} onChange={e => set("performance_score", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">평가일</Label><Input type="date" value={form.evaluation_date || ""} onChange={e => set("evaluation_date", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">평가 소견</Label><Textarea value={form.evaluation_note || ""} onChange={e => set("evaluation_note", e.target.value)} rows={2} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={!!form.auto_renew} onCheckedChange={v => set("auto_renew", v)} /><Label className="text-sm">자동갱신</Label>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">상태</Label>
              <Select value={form.status || "active"} onValueChange={v => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONTRACT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">비고</Label><Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} /></div>
            <AuthorField value={form.author_name || ""} onChange={v => set("author_name", v)} />
          </div>
          <DialogFooter>
            <div className="flex gap-2 ml-auto"><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
