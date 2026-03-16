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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { VIOLATION_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from "@/types/operations";
import { Plus, Search } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

export default function OpsEnforcementPage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: records } = useQuery({ queryKey: ["enforcement-records"], queryFn: async () => {
    const { data } = await supabase.from("enforcement_records").select("*, parking_lots(code, name)").order("violation_date", { ascending: false });
    return data || [];
  }});

  const { data: lots } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
    return data || [];
  }});

  const filtered = (records || []).filter((r: any) => {
    if (statusFilter !== "all" && r.payment_status !== statusFilter) return false;
    if (typeFilter !== "all" && r.violation_type !== typeFilter) return false;
    if (search && !r.vehicle_number.includes(search)) return false;
    return true;
  });

  const unpaidCount = (records || []).filter((r: any) => r.payment_status === "unpaid").length;
  const overdueCount = (records || []).filter((r: any) => r.payment_status === "overdue").length;
  const unpaidTotal = (records || []).filter((r: any) => ["unpaid", "overdue"].includes(r.payment_status)).reduce((s: number, r: any) => s + (r.fine_amount || 0), 0);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const generateNumber = () => {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `EN-${d}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;
  };

  const openNew = () => {
    setEditing(null);
    setForm({ payment_status: "unpaid", enforcement_number: generateNumber(), violation_date: new Date().toISOString().slice(0, 16), officer_id: user?.id, officer_name: profile?.name });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.vehicle_number || !form.violation_type) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, created_at, updated_at, ...payload } = form;
      if (editing) {
        await supabase.from("enforcement_records").update(payload).eq("id", editing.id);
      } else {
        await supabase.from("enforcement_records").insert(payload);
        await logActivity({ module: "ops", action: "create", targetType: "enforcement", targetName: form.vehicle_number });
      }
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["enforcement-records"] });
      setDialogOpen(false);
      setDetailOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const markPaid = async (r: any) => {
    await supabase.from("enforcement_records").update({ payment_status: "paid", fine_paid_date: new Date().toISOString().split("T")[0] }).eq("id", r.id);
    toast({ title: "납부 처리됨" });
    queryClient.invalidateQueries({ queryKey: ["enforcement-records"] });
    setDetailOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">단속 기록</h2>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 단속 등록</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-3 pb-2"><span className="text-xs text-muted-foreground">총 건수</span><p className="text-xl font-bold">{records?.length || 0}</p></CardContent></Card>
          <Card><CardContent className="pt-3 pb-2"><span className="text-xs text-muted-foreground">미납</span><p className="text-xl font-bold text-yellow-600">{unpaidCount}</p></CardContent></Card>
          <Card><CardContent className="pt-3 pb-2"><span className="text-xs text-muted-foreground">체납</span><p className="text-xl font-bold text-destructive">{overdueCount}</p></CardContent></Card>
          <Card><CardContent className="pt-3 pb-2"><span className="text-xs text-muted-foreground">미납 총액</span><p className="text-xl font-bold text-destructive">{unpaidTotal.toLocaleString()}원</p></CardContent></Card>
        </div>

        <Card><CardContent className="pt-4 pb-3"><div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="차량번호 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" /></div>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 유형</SelectItem>{Object.entries(VIOLATION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div></CardContent></Card>

        <Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>번호</TableHead><TableHead>일시</TableHead><TableHead>주차장</TableHead>
            <TableHead>차량번호</TableHead><TableHead>위반유형</TableHead><TableHead className="text-right">과태료</TableHead>
            <TableHead>납부기한</TableHead><TableHead>상태</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">데이터 없음</TableCell></TableRow> :
            filtered.map((r: any) => {
              const overdue = r.payment_status === "overdue" || (r.payment_status === "unpaid" && r.fine_due_date && new Date(r.fine_due_date) < new Date());
              return (
                <TableRow key={r.id} className={`cursor-pointer hover:bg-accent/50 ${overdue ? "bg-red-50 dark:bg-red-900/10" : ""}`} onClick={() => { setEditing(r); setForm({ ...r }); setDetailOpen(true); }}>
                  <TableCell className="font-mono text-[10px]">{r.enforcement_number}</TableCell>
                  <TableCell className="text-xs">{new Date(r.violation_date).toLocaleString("ko")}</TableCell>
                  <TableCell className="text-xs">{(r.parking_lots as any)?.name || "-"}</TableCell>
                  <TableCell className="text-sm font-bold">{r.vehicle_number}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{VIOLATION_TYPE_LABELS[r.violation_type] || r.violation_type}</Badge></TableCell>
                  <TableCell className="text-xs text-right">{r.fine_amount?.toLocaleString() || "-"}원</TableCell>
                  <TableCell className="text-xs">{r.fine_due_date || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_COLORS[r.payment_status] || ""}`}>{PAYMENT_STATUS_LABELS[r.payment_status]}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table>
        </CardContent></Card>
      </div>

      {/* New Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>단속 등록</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">주차장</Label>
              <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">차량번호 *</Label><Input value={form.vehicle_number || ""} onChange={e => set("vehicle_number", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">위반유형 *</Label>
                <Select value={form.violation_type || ""} onValueChange={v => set("violation_type", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{Object.entries(VIOLATION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">위반일시</Label><Input type="datetime-local" value={form.violation_date || ""} onChange={e => set("violation_date", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">과태료(원)</Label><Input type="number" value={form.fine_amount ?? ""} onChange={e => set("fine_amount", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">납부기한</Label><Input type="date" value={form.fine_due_date || ""} onChange={e => set("fine_due_date", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">위반장소</Label><Input value={form.violation_location || ""} onChange={e => set("violation_location", e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>등록</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>단속 상세</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-xs text-muted-foreground">단속번호</span><p className="font-mono">{editing.enforcement_number}</p></div>
                <div><span className="text-xs text-muted-foreground">차량번호</span><p className="font-bold">{editing.vehicle_number}</p></div>
                <div><span className="text-xs text-muted-foreground">위반유형</span><p>{VIOLATION_TYPE_LABELS[editing.violation_type]}</p></div>
                <div><span className="text-xs text-muted-foreground">과태료</span><p>{editing.fine_amount?.toLocaleString()}원</p></div>
                <div><span className="text-xs text-muted-foreground">위반일시</span><p>{new Date(editing.violation_date).toLocaleString("ko")}</p></div>
                <div><span className="text-xs text-muted-foreground">납부상태</span><Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_COLORS[editing.payment_status]}`}>{PAYMENT_STATUS_LABELS[editing.payment_status]}</Badge></div>
              </div>
              {["unpaid", "overdue"].includes(editing.payment_status) && (
                <Button className="w-full" onClick={() => markPaid(editing)}>납부 확인</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
