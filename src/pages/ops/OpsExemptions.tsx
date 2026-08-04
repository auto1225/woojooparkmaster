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
import { Plus, Search } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { LOT_TYPE_LABELS } from "@/types/database";

export default function OpsExemptionsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("type");

  const { data: exemptions, error: exemptionsError } = useQuery({ queryKey: ["fee-exemptions"], queryFn: async () => {
    const { data, error } = await supabase.from("fee_exemptions").select("*, parking_lots(code, name, lot_type)").order("exemption_type");
    if (error) throw error;
    return data || [];
  }});

  const { data: lots, error: lotsError } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
    if (error) throw error;
    return data || [];
  }});

  const visible = (exemptions || []).filter((e: any) => {
    if (!search) return true;
    return `${e.exemption_name} ${e.required_documents || ""} ${e.legal_basis || ""} ${e.parking_lots?.name || ""} ${e.document_number || ""}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"));
  }).sort((a: any, b: any) => {
    if (sortBy === "name") return a.exemption_name.localeCompare(b.exemption_name, "ko");
    if (sortBy === "effective_new") return (b.effective_from || "").localeCompare(a.effective_from || "");
    return a.exemption_type.localeCompare(b.exemption_type);
  });
  const common = visible.filter((e: any) => !e.lot_id);
  const individual = visible.filter((e: any) => !!e.lot_id);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openNew = (isCommon: boolean) => { setEditing(null); setForm({ discount_type: "rate", is_active: true, effective_from: new Date().toISOString().slice(0, 10), lot_id: isCommon ? null : "" }); setDialogOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm({ ...e }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.exemption_name || !form.exemption_type) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    if (form.discount_type === "rate" && ((form.discount_rate || 0) < 0 || (form.discount_rate || 0) > 100)) { toast({ title: "감면율은 0~100%로 입력하세요", variant: "destructive" }); return; }
    if (form.discount_type === "amount" && (form.discount_amount || 0) < 0) { toast({ title: "감면액은 0원 이상이어야 합니다", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, ...payload } = form;
      if (payload.lot_id === "") payload.lot_id = null;
      const { error } = editing
        ? await supabase.from("fee_exemptions").update(payload).eq("id", editing.id)
        : await supabase.from("fee_exemptions").insert(payload);
      if (error) throw error;
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["fee-exemptions"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (e: any) => {
    try {
      const { error } = await supabase.from("fee_exemptions").update({ is_active: !e.is_active }).eq("id", e.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["fee-exemptions"] });
    } catch (err: any) {
      toast({ title: "상태 변경 실패", description: err.message, variant: "destructive" });
    }
  };

  const queryError = exemptionsError || lotsError;

  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">감면 정책을 불러오지 못했습니다: {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  const renderTable = (items: any[]) => (
    <Table><TableHeader><TableRow>
      <TableHead>적용 주차장</TableHead><TableHead>유형</TableHead><TableHead>감면명</TableHead><TableHead>방식</TableHead>
      <TableHead>감면률/액</TableHead><TableHead>필요서류</TableHead><TableHead>법적근거</TableHead><TableHead>상태</TableHead>
    </TableRow></TableHeader><TableBody>
      {items.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">데이터 없음</TableCell></TableRow> :
      items.map((e: any) => (
        <TableRow key={e.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openEdit(e)}>
          <TableCell className="text-xs"><span className="block">{e.parking_lots?.name || "전체 공통"}</span>{e.parking_lots?.lot_type && <span className="text-[10px] text-muted-foreground">{LOT_TYPE_LABELS[e.parking_lots.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</span>}</TableCell>
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
        <Card><CardContent className="flex flex-wrap gap-3 py-3"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="감면명·증빙·근거·주차장·문서 검색" /></div><Select value={sortBy} onValueChange={setSortBy}><SelectTrigger className="h-9 w-[145px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="type">감면유형순</SelectItem><SelectItem value="name">감면명순</SelectItem><SelectItem value="effective_new">최근 시행순</SelectItem></SelectContent></Select></CardContent></Card>

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
                <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="전체 공통" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name} · {LOT_TYPE_LABELS[l.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</SelectItem>)}</SelectContent></Select>
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
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-xs">시행일</Label><Input type="date" value={form.effective_from || ""} onChange={e => set("effective_from", e.target.value)} /></div><div className="space-y-1.5"><Label className="text-xs">종료일</Label><Input type="date" value={form.effective_to || ""} onChange={e => set("effective_to", e.target.value)} /></div></div>
            <div className="space-y-1.5"><Label className="text-xs">관련 공식 문서번호</Label><Input value={form.document_number || ""} onChange={e => set("document_number", e.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
            <AuthorField value={form.author_name || ""} onChange={v => set("author_name", v)} />
          </div>
          <DialogFooter>
            <div className="flex gap-2 ml-auto"><Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button><Button onClick={handleSave} disabled={saving}>저장</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
