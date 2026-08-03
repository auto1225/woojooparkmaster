import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { DAY_TYPE_LABELS } from "@/types/operations";
import { Plus, Pencil, Search } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { LOT_TYPE_LABELS } from "@/types/database";

export default function OpsFeesPage() {
  const queryClient = useQueryClient();
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [lotSearch, setLotSearch] = useState("");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("day");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: lots, error: lotsError } = useQuery({ queryKey: ["lots-for-fees"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
    if (error) throw error;
    return data || [];
  }});

  const { data: policies, error: policiesError } = useQuery({ queryKey: ["fee-policies", selectedLot], queryFn: async () => {
    if (!selectedLot) return [];
    const { data, error } = await supabase.from("fee_policies").select("*").eq("lot_id", selectedLot).order("day_type");
    if (error) throw error;
    return data || [];
  }, enabled: !!selectedLot });

  const { data: policyCounts, error: policyCountsError } = useQuery({ queryKey: ["fee-policy-counts"], queryFn: async () => {
    const { data, error } = await supabase.from("fee_policies").select("lot_id");
    if (error) throw error;
    const counts: Record<string, number> = {};
    (data || []).forEach((p: any) => { counts[p.lot_id] = (counts[p.lot_id] || 0) + 1; });
    return counts;
  }});

  const filteredLots = (lots || []).filter((l: any) => {
    if (lotTypeFilter !== "all" && l.lot_type !== lotTypeFilter) return false;
    return !lotSearch || l.name.toLowerCase().includes(lotSearch.toLowerCase()) || l.code.toLowerCase().includes(lotSearch.toLowerCase());
  });
  const sortedPolicies = [...(policies || [])].sort((a: any, b: any) => {
    if (sortBy === "name") return a.policy_name.localeCompare(b.policy_name, "ko");
    if (sortBy === "fee_high") return (b.base_fee || 0) - (a.base_fee || 0);
    if (sortBy === "effective_new") return (b.effective_from || "").localeCompare(a.effective_from || "");
    return (a.day_type || "").localeCompare(b.day_type || "");
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm({ lot_id: selectedLot, day_type: "weekday", is_active: true, effective_from: new Date().toISOString().split("T")[0] }); setDialogOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ ...p }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.policy_name || !form.lot_id) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    if (form.effective_to && form.effective_to < form.effective_from) { toast({ title: "적용기간을 확인하세요", variant: "destructive" }); return; }
    if ([form.base_minutes, form.base_fee, form.add_minutes, form.add_fee, form.daily_max, form.monthly_pass_fee].some((value) => value != null && value < 0)) { toast({ title: "음수 요금은 등록할 수 없습니다", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, created_at, updated_at, ...payload } = form;
      const { error } = editing
        ? await supabase.from("fee_policies").update(payload).eq("id", editing.id)
        : await supabase.from("fee_policies").insert(payload);
      if (error) throw error;
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["fee-policies"] });
      queryClient.invalidateQueries({ queryKey: ["fee-policy-counts"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p: any) => {
    try {
      const { error } = await supabase.from("fee_policies").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["fee-policies"] });
    } catch (err: any) {
      toast({ title: "상태 변경 실패", description: err.message, variant: "destructive" });
    }
  };

  const fmt = (n?: number | null) => n != null ? n.toLocaleString() + "원" : "-";
  const queryError = lotsError || policiesError || policyCountsError;

  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">요금 정책을 불러오지 못했습니다: {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">요금 정책</h2>
          {selectedLot && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 정책 등록</Button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left: Lot list */}
          <Card className="md:col-span-1">
            <CardHeader className="space-y-2 pb-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="주차장 검색" value={lotSearch} onChange={e => setLotSearch(e.target.value)} className="pl-9 h-9" /></div><Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem><SelectItem value="offstreet">노외주차장</SelectItem><SelectItem value="multilevel">주차빌딩</SelectItem><SelectItem value="onstreet">노상주차장</SelectItem></SelectContent></Select></CardHeader>
            <CardContent className="max-h-[60vh] overflow-y-auto p-0">
              {filteredLots.map((l: any) => (
                <button key={l.id} onClick={() => setSelectedLot(l.id)} className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm border-b hover:bg-accent/50 transition-colors ${selectedLot === l.id ? "bg-primary/10 font-medium" : ""}`}>
                  <div><span className="font-mono text-[10px] text-muted-foreground mr-2">{l.code}</span>{l.name}<span className="ml-2 text-[10px] text-muted-foreground">{LOT_TYPE_LABELS[l.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</span></div>
                  {(policyCounts || {})[l.id] && <Badge variant="secondary" className="text-[10px]">{(policyCounts || {})[l.id]}</Badge>}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Right: Policies */}
          <div className="md:col-span-2 space-y-3">
            {selectedLot && <div className="flex justify-end"><Select value={sortBy} onValueChange={setSortBy}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">요일순</SelectItem><SelectItem value="name">정책명순</SelectItem><SelectItem value="fee_high">기본요금 높은순</SelectItem><SelectItem value="effective_new">최근 시행순</SelectItem></SelectContent></Select></div>}
            {!selectedLot ? <Card><CardContent className="py-16 text-center text-muted-foreground">좌측에서 주차장을 선택하세요</CardContent></Card> :
            (policies || []).length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">등록된 요금 정책이 없습니다</CardContent></Card> :
            sortedPolicies.map((p: any) => (
              <Card key={p.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.policy_name}</span>
                      <Badge variant="outline" className="text-[10px]">{DAY_TYPE_LABELS[p.day_type] || p.day_type}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-muted-foreground">기본:</span> {p.base_minutes}분 {fmt(p.base_fee)}</div>
                    <div><span className="text-muted-foreground">추가:</span> {p.add_minutes}분당 {fmt(p.add_fee)}</div>
                    <div><span className="text-muted-foreground">1일 최대:</span> {fmt(p.daily_max)}</div>
                    <div><span className="text-muted-foreground">월정기:</span> {fmt(p.monthly_pass_fee)}</div>
                  </div>
                  <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground">
                    <span>적용: {p.effective_from} ~ {p.effective_to || "무기한"}</span>
                    {p.legal_basis && <span>근거: {p.legal_basis}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "정책 수정" : "정책 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">정책명 *</Label><Input value={form.policy_name || ""} onChange={e => set("policy_name", e.target.value)} placeholder="예: 평일 주간 요금" /></div>
            <div className="space-y-1.5"><Label className="text-xs">적용 요일</Label>
              <Select value={form.day_type || "weekday"} onValueChange={v => set("day_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DAY_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">기본시간(분)</Label><Input type="number" value={form.base_minutes ?? ""} onChange={e => set("base_minutes", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">기본요금(원)</Label><Input type="number" value={form.base_fee ?? ""} onChange={e => set("base_fee", Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">추가시간(분)</Label><Input type="number" value={form.add_minutes ?? ""} onChange={e => set("add_minutes", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">추가요금(원)</Label><Input type="number" value={form.add_fee ?? ""} onChange={e => set("add_fee", Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">1일 최대(원)</Label><Input type="number" value={form.daily_max ?? ""} onChange={e => set("daily_max", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">월정기(원)</Label><Input type="number" value={form.monthly_pass_fee ?? ""} onChange={e => set("monthly_pass_fee", Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">시행일</Label><Input type="date" value={form.effective_from || ""} onChange={e => set("effective_from", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">종료일</Label><Input type="date" value={form.effective_to || ""} onChange={e => set("effective_to", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">조례 근거</Label><Input value={form.legal_basis || ""} onChange={e => set("legal_basis", e.target.value)} /></div>
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
