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
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_COLORS } from "@/types/operations";
import { Plus, Trash2 } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

export default function OpsContractsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: contracts } = useQuery({ queryKey: ["ops-contracts-list"], queryFn: async () => {
    const { data } = await supabase.from("outsourcing_contracts").select("*, parking_lots(code, name)").order("contract_end", { ascending: true });
    return data || [];
  }});

  const { data: lots } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
    return data || [];
  }});

  const now = new Date();
  const d30 = new Date(); d30.setDate(d30.getDate() + 30);

  const filtered = (contracts || []).filter((c: any) => {
    if (statusFilter === "expiring") return c.status === "active" && new Date(c.contract_end) <= d30;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const openNew = () => { setEditing(null); setForm({ status: "active", auto_renew: false }); setDialogOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ ...c }); setDialogOpen(true); };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.lot_id || !form.company_name || !form.contract_start || !form.contract_end) { toast({ title: "필수 입력을 확인하세요", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, ...payload } = form;
      if (!editing) payload.created_by = user?.id;
      if (editing) {
        await supabase.from("outsourcing_contracts").update(payload).eq("id", editing.id);
        await logActivity({ module: "ops", action: "update", targetType: "contract", targetId: editing.id, targetName: form.company_name });
      } else {
        await supabase.from("outsourcing_contracts").insert(payload);
        await logActivity({ module: "ops", action: "create", targetType: "contract", targetName: form.company_name });
      }
      toast({ title: "저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["ops-contracts-list"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editing) return;
    await supabase.from("outsourcing_contracts").delete().eq("id", editing.id);
    await logActivity({ module: "ops", action: "delete", targetType: "contract", targetId: editing.id, targetName: editing.company_name });
    toast({ title: "삭제됨" });
    queryClient.invalidateQueries({ queryKey: ["ops-contracts-list"] });
    setDialogOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">위탁 계약</h2>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 계약 등록</Button>
        </div>

        <Card><CardContent className="pt-4 pb-3"><div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {Object.entries(CONTRACT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            <SelectItem value="expiring">30일 이내 만료</SelectItem>
          </SelectContent></Select>
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
                  <TableCell className="text-xs">{(c.parking_lots as any)?.name}</TableCell>
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
              <div className="space-y-1.5"><Label className="text-xs">평가점수 (1~10)</Label><Input type="number" min={1} max={10} step={0.1} value={form.performance_score || ""} onChange={e => set("performance_score", Number(e.target.value))} /></div>
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
          <DialogFooter className="flex justify-between">
            {editing && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="h-3.5 w-3.5 mr-1" />삭제</Button>}
            <div className="flex gap-2 ml-auto"><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
