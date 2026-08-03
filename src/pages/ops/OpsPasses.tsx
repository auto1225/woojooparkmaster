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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { PASS_STATUS_LABELS } from "@/types/operations";
import { Plus, Search, RefreshCw, RotateCcw } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { LOT_TYPE_LABELS } from "@/types/database";

export default function OpsPassesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const lotFilter = searchParams.get("lot") || "all";
  const statusFilter = searchParams.get("status") || "all";
  const lotTypeFilter = searchParams.get("lotType") || "all";
  const sortBy = searchParams.get("sort") || "newest";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [renewTarget, setRenewTarget] = useState<any>(null);

  const { data: passes, error: passesError } = useQuery({ queryKey: ["monthly-passes"], queryFn: async () => {
    const { data, error } = await supabase.from("monthly_passes").select("*, parking_lots(code, name, lot_type)").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }});

  const { data: lots, error: lotsError } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
    if (error) throw error;
    return data || [];
  }});

  const now = new Date();
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);

  const filtered = (passes || []).filter((p: any) => {
    if (lotFilter !== "all" && p.lot_id !== lotFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (lotTypeFilter !== "all" && p.parking_lots?.lot_type !== lotTypeFilter) return false;
    if (search) {
      const haystack = `${p.pass_number} ${p.vehicle_number} ${p.holder_name || ""} ${p.holder_phone || ""} ${p.receipt_number || ""} ${p.document_number || ""}`.toLocaleLowerCase("ko");
      if (!haystack.includes(search.toLocaleLowerCase("ko"))) return false;
    }
    return true;
  }).sort((a: any, b: any) => {
    if (sortBy === "end_soon") return a.pass_end.localeCompare(b.pass_end);
    if (sortBy === "end_late") return b.pass_end.localeCompare(a.pass_end);
    if (sortBy === "vehicle") return a.vehicle_number.localeCompare(b.vehicle_number, "ko");
    if (sortBy === "lot") return (a.parking_lots?.name || "").localeCompare(b.parking_lots?.name || "", "ko");
    if (sortBy === "fee_high") return (b.fee_amount || 0) - (a.fee_amount || 0);
    return (b.created_at || "").localeCompare(a.created_at || "");
  });

  const setParam = (key: string, value: string, defaultValue = "") => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key); else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const activeCount = (passes || []).filter((p: any) => p.status === "active").length;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const generatePassNumber = () => {
    const ym = new Date().toISOString().slice(0, 7).replace("-", "");
    const n = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
    return `MP-${ym}-${n}`;
  };

  const openNew = () => {
    const start = new Date().toISOString().split("T")[0];
    const end = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    setEditing(null);
    setForm({ status: "active", auto_renew: false, fee_paid: 0, fee_amount: 0, pass_number: generatePassNumber(), pass_start: start, pass_end: end });
    setDialogOpen(true);
  };

  const setDuration = (months: number) => {
    const start = form.pass_start || new Date().toISOString().split("T")[0];
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    set("pass_end", d.toISOString().split("T")[0]);
  };

  const handleSave = async () => {
    if (!form.lot_id || !form.vehicle_number || !form.pass_number) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    if (!form.pass_start || !form.pass_end || form.pass_end < form.pass_start) { toast({ title: "이용기간을 확인하세요", variant: "destructive" }); return; }
    if ((form.fee_amount || 0) < 0 || (form.fee_paid || 0) < 0 || (form.fee_paid || 0) > (form.fee_amount || 0)) { toast({ title: "요금과 납부액을 확인하세요", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, created_at, updated_at, ...payload } = form;
      if (!editing) payload.issued_by = user?.id;
      if (editing) {
        const { error } = await supabase.from("monthly_passes").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logActivity({ module: "ops", action: "update", targetType: "monthly_pass", targetId: editing.id, targetName: form.vehicle_number });
      } else {
        const { error } = await supabase.from("monthly_passes").insert(payload);
        if (error) throw error;
        await logActivity({ module: "ops", action: "create", targetType: "monthly_pass", targetName: form.vehicle_number });
      }
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["monthly-passes"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleRenew = async (p: any) => {
    setSaving(true);
    try {
      const newStart = new Date(new Date(p.pass_end).getTime() + 86400000).toISOString().split("T")[0];
      const newEnd = new Date(new Date(newStart).getTime() + 30 * 86400000).toISOString().split("T")[0];
      const { error } = await (supabase as any).rpc("renew_monthly_pass", {
        p_existing_pass_id: p.id,
        p_pass_start: newStart,
        p_pass_end: newEnd,
        p_fee_amount: p.fee_amount || 0,
        p_payment_method: null,
        p_payment_date: null,
        p_receipt_number: null,
        p_document_number: p.document_number || null,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;

      await logActivity({ module: "ops", action: "renew", targetType: "monthly_pass", targetName: p.vehicle_number });
      toast({ title: "갱신 완료" });
      queryClient.invalidateQueries({ queryKey: ["monthly-passes"] });
      setRenewTarget(null);
    } catch (err: any) {
      toast({ title: "갱신 실패", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const queryError = passesError || lotsError;

  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">월정기권을 불러오지 못했습니다: {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div><h2 className="text-xl font-bold">월정기권</h2><p className="text-sm text-muted-foreground">활성 {activeCount}건</p></div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 정기권 발급</Button>
        </div>

        <Card><CardContent className="pt-4 pb-3"><div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="번호·차량·이용자·영수증·문서 검색" value={search} onChange={e => setParam("q", e.target.value)} className="pl-9 h-9" /></div>
          <Select value={lotFilter} onValueChange={v => setParam("lot", v, "all")}><SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="주차장" /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={v => setParam("status", v, "all")}><SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{Object.entries(PASS_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={lotTypeFilter} onValueChange={v => setParam("lotType", v, "all")}><SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem><SelectItem value="offstreet">노외주차장</SelectItem><SelectItem value="multilevel">주차빌딩</SelectItem><SelectItem value="onstreet">노상주차장</SelectItem></SelectContent></Select>
          <Select value={sortBy} onValueChange={v => setParam("sort", v, "newest")}><SelectTrigger className="w-[145px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">최근 발급순</SelectItem><SelectItem value="end_soon">만료 임박순</SelectItem><SelectItem value="end_late">만료 먼순</SelectItem><SelectItem value="vehicle">차량번호순</SelectItem><SelectItem value="lot">주차장순</SelectItem><SelectItem value="fee_high">요금 높은순</SelectItem></SelectContent></Select>
          <Button type="button" size="icon" variant="ghost" title="필터 초기화" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}><RotateCcw className="h-4 w-4" /></Button>
        </div></CardContent></Card>

        <Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>번호</TableHead><TableHead>차량번호</TableHead><TableHead>주차장</TableHead>
            <TableHead>이용자</TableHead><TableHead>기간</TableHead><TableHead className="text-right">요금</TableHead>
            <TableHead>상태</TableHead><TableHead></TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">데이터 없음</TableCell></TableRow> :
            filtered.map((p: any) => {
              const expiring = p.status === "active" && new Date(p.pass_end) <= d7;
              const expired = p.status === "expired";
              return (
                <TableRow key={p.id} className={`${expiring ? "bg-yellow-50 dark:bg-yellow-900/10" : ""} ${expired ? "text-muted-foreground" : ""}`} onClick={() => { setEditing(p); setForm({ ...p }); setDialogOpen(true); }}>
                  <TableCell className="font-mono text-[10px]">{p.pass_number}</TableCell>
                  <TableCell className="text-sm font-bold">{p.vehicle_number}</TableCell>
                  <TableCell className="text-xs"><span className="block">{(p.parking_lots as any)?.name}</span><span className="text-[10px] text-muted-foreground">{LOT_TYPE_LABELS[(p.parking_lots as any)?.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</span></TableCell>
                  <TableCell className="text-xs">{p.holder_name || "-"}</TableCell>
                  <TableCell className="text-xs">{p.pass_start} ~ {p.pass_end}</TableCell>
                  <TableCell className="text-xs text-right">{p.fee_amount?.toLocaleString()}원</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${p.status === "active" ? "bg-success/10 text-success" : ""}`}>{PASS_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                  <TableCell>{p.status === "active" && <Button variant="ghost" size="icon" title="정기권 갱신" aria-label={`${p.vehicle_number} 정기권 갱신`} disabled={saving} onClick={e => { e.stopPropagation(); setRenewTarget(p); }}><RefreshCw className="h-3.5 w-3.5" /></Button>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table>
        </CardContent></Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "정기권 수정" : "정기권 발급"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">주차장 *</Label>
              <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name} · {LOT_TYPE_LABELS[l.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">정기권번호</Label><Input value={form.pass_number || ""} disabled /></div>
              <div className="space-y-1.5"><Label className="text-xs">차량번호 *</Label><Input value={form.vehicle_number || ""} onChange={e => set("vehicle_number", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">이용자명</Label><Input value={form.holder_name || ""} onChange={e => set("holder_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">연락처</Label><Input value={form.holder_phone || ""} onChange={e => set("holder_phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">차종</Label>
                <Select value={form.vehicle_type || ""} onValueChange={v => set("vehicle_type", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>
                  {Object.entries({ sedan: "승용", suv: "SUV", compact: "경형", ev: "전기차", disabled: "장애인 차량" }).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent></Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">이용기간</Label>
              <div className="flex gap-2 mb-1">{[1, 3, 6, 12].map(m => <Button key={m} variant="outline" size="sm" className="text-xs" onClick={() => setDuration(m)}>{m}개월</Button>)}</div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={form.pass_start || ""} onChange={e => set("pass_start", e.target.value)} />
                <Input type="date" value={form.pass_end || ""} onChange={e => set("pass_end", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">요금(원)</Label><Input type="number" value={form.fee_amount ?? ""} onChange={e => set("fee_amount", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">납부액(원)</Label><Input type="number" value={form.fee_paid ?? ""} onChange={e => set("fee_paid", Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-xs">납부방법</Label><Select value={form.payment_method || ""} onValueChange={v => set("payment_method", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent><SelectItem value="card">카드</SelectItem><SelectItem value="transfer">계좌이체</SelectItem><SelectItem value="cash">현금</SelectItem><SelectItem value="mobile">모바일</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">영수증번호</Label><Input value={form.receipt_number || ""} onChange={e => set("receipt_number", e.target.value)} /></div></div>
            <div className="space-y-1.5"><Label className="text-xs">관련 공식 문서번호</Label><Input value={form.document_number || ""} onChange={e => set("document_number", e.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={!!form.auto_renew} onCheckedChange={v => set("auto_renew", v)} /><Label className="text-sm">자동갱신</Label>
            </div>
            <AuthorField value={form.author_name || ""} onChange={v => set("author_name", v)} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(renewTarget)} onOpenChange={(open) => !open && setRenewTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{renewTarget?.vehicle_number} 정기권을 1개월 갱신하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>기존 정기권은 만료 처리되고 다음 날부터 사용할 새 정기권이 발급됩니다. 갱신은 하나의 작업으로 처리되어 중복 발급되지 않습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); if (renewTarget) handleRenew(renewTarget); }}>{saving ? "갱신 중..." : "갱신"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
