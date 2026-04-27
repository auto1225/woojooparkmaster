import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { EXEMPTION_TYPE_LABELS, DISCOUNT_TYPE_LABELS } from "@/types/operations";
import { Plus, Trash2 } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

export default function OpsExemptionsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: exemptions } = useQuery({ queryKey: ["fee-exemptions"], queryFn: async () => {
    const { data } = await supabase.from("fee_exemptions").select("*").order("exemption_type");
    return data || [];
  }});

  const { data: lots } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
    return data || [];
  }});

  const common = (exemptions || []).filter((e: any) => !e.lot_id);
  const individual = (exemptions || []).filter((e: any) => !!e.lot_id);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openNew = (isCommon: boolean) => { setEditing(null); setForm({ discount_type: "rate", is_active: true, lot_id: isCommon ? null : "" }); setDialogOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm({ ...e }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.exemption_name || !form.exemption_type) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, ...payload } = form;
      if (payload.lot_id === "") payload.lot_id = null;
      if (editing) await supabase.from("fee_exemptions").update(payload).eq("id", editing.id);
      else await supabase.from("fee_exemptions").insert(payload);
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["fee-exemptions"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editing) return;
    await supabase.from("fee_exemptions").delete().eq("id", editing.id);
    toast({ title: "삭제됨" });
    queryClient.invalidateQueries({ queryKey: ["fee-exemptions"] });
    setDialogOpen(false);
  };

  const toggleActive = async (e: any) => {
    await supabase.from("fee_exemptions").update({ is_active: !e.is_active }).eq("id", e.id);
    queryClient.invalidateQueries({ queryKey: ["fee-exemptions"] });
  };

  const renderTable = (items: any[]) => (
    <Table><TableHeader><TableRow>
      <TableHead>유형</TableHead><TableHead>감면명</TableHead><TableHead>방식</TableHead>
      <TableHead>감면률/액</TableHead><TableHead>필요서류</TableHead><TableHead>법적근거</TableHead><TableHead>상태</TableHead>
    </TableRow></TableHeader><TableBody>
      {items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">데이터 없음</TableCell></TableRow> :
      items.map((e: any) => (
        <TableRow key={e.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openEdit(e)}>
          <TableCell className="text-xs">{EXEMPTION_TYPE_LABELS[e.exemption_type] || e.exemption_type}</TableCell>
          <TableCell className="text-sm font-medium">{e.exemption_name}</TableCell>
          <TableCell><Badge variant="outline" className="text-[10px]">{DISCOUNT_TYPE_LABELS[e.discount_type]}</Badge></TableCell>
          <TableCell className="text-xs">{e.discount_type === "free" ? "전액" : e.discount_type === "rate" ? `${e.discount_rate}%` : `${e.discount_amount?.toLocaleString()}원`}</TableCell>
          <TableCell className="text-xs max-w-[150px] truncate">{e.required_documents || "-"}</TableCell>
          <TableCell className="text-xs max-w-[150px] truncate">{e.legal_basis || "-"}</TableCell>
          <TableCell><Switch checked={e.is_active} onCheckedChange={() => toggleActive(e)} onClick={ev => ev.stopPropagation()} /></TableCell>
        </TableRow>
      ))}
    </TableBody></Table>
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">감면/면제 관리</h2>
        <p className="text-sm text-muted-foreground">전체 주차장에 공통 적용되는 감면 기준과, 특정 주차장에만 적용되는 개별 감면을 관리합니다.</p>

        <Tabs defaultValue="common">
          <TabsList><TabsTrigger value="common">공통 감면</TabsTrigger><TabsTrigger value="individual">개별 감면</TabsTrigger></TabsList>
          <TabsContent value="common" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => openNew(true)}><Plus className="h-4 w-4 mr-1" /> 감면 기준 추가</Button></div>
            <Card><CardContent className="p-0">{renderTable(common)}</CardContent></Card>
          </TabsContent>
          <TabsContent value="individual" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => openNew(false)}><Plus className="h-4 w-4 mr-1" /> 개별 감면 추가</Button></div>
            <Card><CardContent className="p-0">{renderTable(individual)}</CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "감면 수정" : "감면 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {form.lot_id !== null && form.lot_id !== undefined && (
              <div className="space-y-1.5"><Label className="text-xs">주차장</Label>
                <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="전체 공통" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            <div className="space-y-1.5"><Label className="text-xs">감면유형</Label>
              <Select value={form.exemption_type || ""} onValueChange={v => set("exemption_type", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{Object.entries(EXEMPTION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">감면명 *</Label><Input value={form.exemption_name || ""} onChange={e => set("exemption_name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">감면방식</Label>
              <RadioGroup value={form.discount_type || "rate"} onValueChange={v => set("discount_type", v)} className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="rate" id="dt-r" /><Label htmlFor="dt-r" className="text-sm font-normal">정률(%)</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="amount" id="dt-a" /><Label htmlFor="dt-a" className="text-sm font-normal">정액(원)</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="free" id="dt-f" /><Label htmlFor="dt-f" className="text-sm font-normal">전액면제</Label></div>
              </RadioGroup>
            </div>
            {form.discount_type === "rate" && <div className="space-y-1.5"><Label className="text-xs">감면률(%)</Label><Input type="number" value={form.discount_rate ?? ""} onChange={e => set("discount_rate", Number(e.target.value))} /></div>}
            {form.discount_type === "amount" && <div className="space-y-1.5"><Label className="text-xs">감면액(원)</Label><Input type="number" value={form.discount_amount ?? ""} onChange={e => set("discount_amount", Number(e.target.value))} /></div>}
            <div className="space-y-1.5"><Label className="text-xs">필요 증빙서류</Label><Input value={form.required_documents || ""} onChange={e => set("required_documents", e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">법적 근거</Label><Input value={form.legal_basis || ""} onChange={e => set("legal_basis", e.target.value)} /></div>
            <AuthorField value={form.author_name || ""} onChange={v => set("author_name", v)} />
          </div>
          <DialogFooter className="flex justify-between">
            {editing && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="h-3.5 w-3.5 mr-1" />삭제</Button>}
            <div className="flex gap-2 ml-auto"><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>저장</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
