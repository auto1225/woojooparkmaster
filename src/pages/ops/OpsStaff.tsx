import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { STAFF_TYPE_LABELS } from "@/types/operations";
import { LOT_TYPE_LABELS } from "@/types/database";
import { Plus, Search, RotateCcw } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

export default function OpsStaffPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [lotFilter, setLotFilter] = useState(searchParams.get("lot") || "all");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("staffType") || "all");
  const [lotTypeFilter, setLotTypeFilter] = useState(searchParams.get("lotType") || "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "newest");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: staffList, error: staffError } = useQuery({ queryKey: ["ops-staff-list"], queryFn: async () => {
    const { data, error } = await supabase.from("operations_staff").select("*, parking_lots(code, name, lot_type)").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }});

  const { data: lots, error: lotsError } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
    if (error) throw error;
    return data || [];
  }});

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (lotFilter !== "all") next.set("lot", lotFilter);
    if (typeFilter !== "all") next.set("staffType", typeFilter);
    if (lotTypeFilter !== "all") next.set("lotType", lotTypeFilter);
    if (sortBy !== "newest") next.set("sort", sortBy);
    setSearchParams(next, { replace: true });
  }, [lotFilter, lotTypeFilter, search, setSearchParams, sortBy, typeFilter]);

  const filtered = (staffList || []).filter((s: any) => {
    if (lotFilter !== "all" && s.lot_id !== lotFilter) return false;
    if (typeFilter !== "all" && s.staff_type !== typeFilter) return false;
    if (lotTypeFilter !== "all" && s.parking_lots?.lot_type !== lotTypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.staff_name?.toLowerCase().includes(q) && !(s.parking_lots as any)?.name?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a: any, b: any) => {
    if (sortBy === "name") return a.staff_name.localeCompare(b.staff_name, "ko");
    if (sortBy === "lot") return (a.parking_lots?.name || "").localeCompare(b.parking_lots?.name || "", "ko");
    if (sortBy === "hire_oldest") return (a.hire_date || "9999").localeCompare(b.hire_date || "9999");
    if (sortBy === "hire_newest") return (b.hire_date || "").localeCompare(a.hire_date || "");
    return (b.created_at || "").localeCompare(a.created_at || "");
  });

  const activeCount = filtered.filter((s: any) => s.is_active).length;

  const openNew = () => { setEditing(null); setForm({ staff_type: "resident", is_active: true, hire_date: new Date().toISOString().slice(0, 10), schedule: { shift: "day" } }); setDialogOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setForm({ ...s }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.lot_id || !form.staff_name) { toast({ title: "필수 입력", description: "주차장과 이름을 입력하세요", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (form.resign_date && form.hire_date && form.resign_date < form.hire_date) throw new Error("퇴직일은 입사일보다 빠를 수 없습니다.");
      const { id, parking_lots, ...payload } = form;
      payload.is_active = form.resign_date ? false : form.is_active !== false;
      if (editing) {
        const { error } = await supabase.from("operations_staff").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logActivity({ module: "ops", action: "update", targetType: "staff", targetId: editing.id, targetName: form.staff_name });
      } else {
        const { error } = await supabase.from("operations_staff").insert(payload);
        if (error) throw error;
        await logActivity({ module: "ops", action: "create", targetType: "staff", targetName: form.staff_name });
      }
      toast({ title: "저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["ops-staff-list"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "저장 실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const queryError = staffError || lotsError;

  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">관리인력을 불러오지 못했습니다: {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div><h2 className="text-xl font-bold">관리인력</h2><p className="text-sm text-muted-foreground">활성 {activeCount}명</p></div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 인력 등록</Button>
        </div>

        <Card><CardContent className="pt-4 pb-3"><div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="이름/주차장 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" /></div>
          <Select value={lotFilter} onValueChange={setLotFilter}><SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="주차장" /></SelectTrigger><SelectContent><SelectItem value="all">전체 주차장</SelectItem>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem><SelectItem value="resident">상주</SelectItem><SelectItem value="non_resident">비상주</SelectItem></SelectContent></Select>
          <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem><SelectItem value="offstreet">노외주차장</SelectItem><SelectItem value="multilevel">주차빌딩</SelectItem><SelectItem value="onstreet">노상주차장</SelectItem></SelectContent></Select>
          <Select value={sortBy} onValueChange={setSortBy}><SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">최근 등록순</SelectItem><SelectItem value="name">이름순</SelectItem><SelectItem value="lot">주차장순</SelectItem><SelectItem value="hire_newest">최근 입사순</SelectItem><SelectItem value="hire_oldest">입사 오래된순</SelectItem></SelectContent></Select>
          <Button type="button" size="icon" variant="ghost" title="필터 초기화" onClick={() => { setSearch(""); setLotFilter("all"); setTypeFilter("all"); setLotTypeFilter("all"); setSortBy("newest"); }}><RotateCcw className="h-4 w-4" /></Button>
        </div></CardContent></Card>

        <Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>주차장</TableHead><TableHead>이름</TableHead><TableHead>직책</TableHead>
            <TableHead>유형</TableHead><TableHead>연락처</TableHead><TableHead>입사일</TableHead><TableHead>상태</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">데이터 없음</TableCell></TableRow> :
            filtered.map((s: any) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openEdit(s)}>
                <TableCell className="text-xs"><span className="block">{(s.parking_lots as any)?.name}</span><span className="text-[10px] text-muted-foreground">{LOT_TYPE_LABELS[(s.parking_lots as any)?.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</span></TableCell>
                <TableCell className="text-sm font-medium">{s.staff_name}</TableCell>
                <TableCell className="text-xs">{s.position || "-"}</TableCell>
                <TableCell><Badge variant="outline" className={`text-[10px] ${s.staff_type === "resident" ? "bg-blue-100 text-blue-700" : ""}`}>{STAFF_TYPE_LABELS[s.staff_type]}</Badge></TableCell>
                <TableCell className="text-xs">{s.phone || "-"}</TableCell>
                <TableCell className="text-xs">{s.hire_date || "-"}</TableCell>
                <TableCell><Badge variant="outline" className={`text-[10px] ${s.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{s.is_active ? "활성" : "비활성"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </CardContent></Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "인력 수정" : "인력 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">주차장 *</Label>
              <Select value={form.lot_id || ""} onValueChange={v => set("lot_id", v)}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{(lots || []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.code} {l.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">이름 *</Label><Input value={form.staff_name || ""} onChange={e => set("staff_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">직책</Label><Input value={form.position || ""} onChange={e => set("position", e.target.value)} placeholder="관리소장, 관리원 등" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">유형</Label>
              <RadioGroup value={form.staff_type || "resident"} onValueChange={v => set("staff_type", v)} className="flex gap-4">
                <div className="flex items-center space-x-2"><RadioGroupItem value="resident" id="st-r" /><Label htmlFor="st-r" className="text-sm font-normal">상주</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="non_resident" id="st-n" /><Label htmlFor="st-n" className="text-sm font-normal">비상주</Label></div>
              </RadioGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">연락처</Label><Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">입사일</Label><Input type="date" value={form.hire_date || ""} onChange={e => set("hire_date", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">근무조</Label><Select value={form.schedule?.shift || "day"} onValueChange={v => set("schedule", { ...(form.schedule || {}), shift: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">주간</SelectItem><SelectItem value="night">야간</SelectItem><SelectItem value="rotation">교대</SelectItem><SelectItem value="field">현장 순회</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">퇴직일</Label><Input type="date" value={form.resign_date || ""} onChange={e => set("resign_date", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">관련 문서번호</Label><Input value={form.document_number || ""} onChange={e => set("document_number", e.target.value)} placeholder="제주시청-차량관리과운영팀-연도-번호" /></div>
            <div className="flex items-center justify-between rounded border px-3 py-2"><Label className="text-sm">재직 중</Label><Switch checked={form.is_active !== false && !form.resign_date} onCheckedChange={v => set("is_active", v)} disabled={!!form.resign_date} /></div>
            <div className="space-y-1.5"><Label className="text-xs">비고</Label><Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} /></div>
            <AuthorField value={form.author_name || ""} onChange={v => set("author_name", v)} />
          </div>
          <DialogFooter>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
