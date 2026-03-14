import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { PASS_STATUS_LABELS } from "@/types/operations";
import { Plus, Search, RefreshCw } from "lucide-react";

export default function OpsPassesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: passes } = useQuery({ queryKey: ["monthly-passes"], queryFn: async () => {
    const { data } = await supabase.from("monthly_passes").select("*, parking_lots(code, name)").order("created_at", { ascending: false });
    return data || [];
  }});

  const { data: lots } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
    return data || [];
  }});

  const now = new Date();
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);

  const filtered = (passes || []).filter((p: any) => {
    if (lotFilter !== "all" && p.lot_id !== lotFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.vehicle_number.includes(search) && !p.holder_name?.includes(search)) return false;
    return true;
  });

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
    setSaving(true);
    try {
      const { id, parking_lots, created_at, updated_at, ...payload } = form;
      if (!editing) payload.issued_by = user?.id;
      if (editing) {
        await supabase.from("monthly_passes").update(payload).eq("id", editing.id);
        await logActivity({ module: "ops", action: "update", targetType: "monthly_pass", targetId: editing.id, targetName: form.vehicle_number });
      } else {
        await supabase.from("monthly_passes").insert(payload);
        await logActivity({ module: "ops", action: "create", targetType: "monthly_pass", targetName: form.vehicle_number });
      }
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["monthly-passes"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleRenew = async (p: any) => {
    const newStart = new Date(new Date(p.pass_end).getTime() + 86400000).toISOString().split("T")[0];
    const newEnd = new Date(new Date(newStart).getTime() + 30 * 86400000).toISOString().split("T")[0];
    const { data, error } = await supabase.from("monthly_passes").insert({
      lot_id: p.lot_id, pass_number: generatePassNumber(), vehicle_number: p.vehicle_number,
      vehicle_type: p.vehicle_type, holder_name: p.holder_name, holder_phone: p.holder_phone,
      pass_start: newStart, pass_end: newEnd, fee_amount: p.fee_amount, fee_paid: 0,
      status: "active", auto_renew: p.auto_renew, renewal_count: (p.renewal_count || 0) + 1,
      previous_pass_id: p.id, issued_by: user?.id,
    }).select().single();
    if (error) { toast({ title: "갱신 실패", description: error.message, variant: "destructive" }); return; }
    await supabase.from("monthly_passes").update({ status: "expired" }).eq("id", p.id);
    await logActivity({ module: "ops", action: "renew", targetType: "monthly_pass", targetName: p.vehicle_number });
    toast({ title: "갱신 완료" });
    queryClient.invalidateQueries({ queryKey: ["monthly-passes"] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div><h2 className="text-xl font-bold">월정기권</h2><p className="text-sm text-muted-foreground">활성 {activeCount}건</p></div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 정기권 발급</Button>
        </div>

        <Card><CardContent className="pt-4 pb-3"><div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="차량번호 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" /></div>
          <Select value={lotFilter} onValueChange={setLotFilter}><SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="주차장" /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{Object.entries(PASS_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
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
                  <TableCell className="text-xs">{(p.parking_lots as any)?.name}</TableCell>
                  <TableCell className="text-xs">{p.holder_name || "-"}</TableCell>
                  <TableCell className="text-xs">{p.pass_start} ~ {p.pass_end}</TableCell>
                  <TableCell className="text-xs text-right">{p.fee_amount?.toLocaleString()}원</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${p.status === "active" ? "bg-success/10 text-success" : ""}`}>{PASS_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                  <TableCell>{p.status === "active" && <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); handleRenew(p); }}><RefreshCw className="h-3.5 w-3.5" /></Button>}</TableCell>
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
              <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name}</SelectItem>)}</SelectContent></Select>
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
                  {["sedan", "suv", "compact", "ev", "disabled"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
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
            <div className="flex items-center gap-3">
              <Switch checked={!!form.auto_renew} onCheckedChange={v => set("auto_renew", v)} /><Label className="text-sm">자동갱신</Label>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
