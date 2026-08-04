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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { DAY_TYPE_LABELS } from "@/types/operations";
import { Plus, Search } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { LOT_TYPE_LABELS } from "@/types/database";

export default function OpsFreeHoursPage() {
  const queryClient = useQueryClient();
  const [selectedLot, setSelectedLot] = useState("");
  const [lotSearch, setLotSearch] = useState("");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("day");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: lots, error: lotsError } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
    if (error) throw error;
    return data || [];
  }});

  const { data: settings, error: settingsError } = useQuery({ queryKey: ["free-hours", selectedLot], queryFn: async () => {
    if (!selectedLot) return [];
    const { data, error } = await supabase.from("free_hours_settings").select("*").eq("lot_id", selectedLot).order("day_type");
    if (error) throw error;
    return data || [];
  }, enabled: !!selectedLot });

  const filteredLots = (lots || []).filter((l: any) => {
    if (lotTypeFilter !== "all" && l.lot_type !== lotTypeFilter) return false;
    return !lotSearch || l.name.toLowerCase().includes(lotSearch.toLowerCase()) || l.code.toLowerCase().includes(lotSearch.toLowerCase());
  });
  const sortedSettings = [...(settings || [])].sort((a: any, b: any) => {
    if (sortBy === "start") return (a.start_time || "").localeCompare(b.start_time || "");
    if (sortBy === "effective_new") return (b.effective_from || "").localeCompare(a.effective_from || "");
    if (sortBy === "name") return (a.setting_name || "").localeCompare(b.setting_name || "", "ko");
    return (a.day_type || "").localeCompare(b.day_type || "");
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm({ lot_id: selectedLot, day_type: "everyday", is_active: true, start_time: "18:00", end_time: "09:00", effective_from: new Date().toISOString().split("T")[0] }); setDialogOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setForm({ ...s }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.lot_id || !form.start_time || !form.end_time) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    const duplicate = (settings || []).some((item: any) => item.id !== editing?.id && item.is_active && item.day_type === form.day_type && item.start_time?.slice(0, 5) === form.start_time && item.end_time?.slice(0, 5) === form.end_time);
    if (duplicate) { toast({ title: "동일한 무료개방 시간이 이미 있습니다", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, created_at, ...payload } = form;
      const { error } = editing
        ? await supabase.from("free_hours_settings").update(payload).eq("id", editing.id)
        : await supabase.from("free_hours_settings").insert(payload);
      if (error) throw error;
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["free-hours"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (s: any) => {
    try {
      const { error } = await supabase.from("free_hours_settings").update({ is_active: !s.is_active }).eq("id", s.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["free-hours"] });
    } catch (err: any) {
      toast({ title: "상태 변경 실패", description: err.message, variant: "destructive" });
    }
  };

  const queryError = lotsError || settingsError;

  if (queryError) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-destructive">무료개방 설정을 불러오지 못했습니다: {queryError.message}</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">무료개방 시간대</h2>
          {selectedLot && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 설정 추가</Button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardContent className="p-0">
              <div className="space-y-2 p-3"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="주차장 검색" value={lotSearch} onChange={e => setLotSearch(e.target.value)} className="pl-9 h-9" /></div><Select value={lotTypeFilter} onValueChange={setLotTypeFilter}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 형태</SelectItem><SelectItem value="offstreet">노외주차장</SelectItem><SelectItem value="multilevel">주차빌딩</SelectItem><SelectItem value="onstreet">노상주차장</SelectItem></SelectContent></Select></div>
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredLots.map((l: any) => (
                  <button key={l.id} onClick={() => setSelectedLot(l.id)} className={`w-full px-4 py-2.5 text-left text-sm border-b hover:bg-accent/50 ${selectedLot === l.id ? "bg-primary/10 font-medium" : ""}`}>
                    <span className="font-mono text-[10px] text-muted-foreground mr-2">{l.code}</span>{l.name}<span className="ml-2 text-[10px] text-muted-foreground">{LOT_TYPE_LABELS[l.lot_type as keyof typeof LOT_TYPE_LABELS] || "기타"}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-3">
            {selectedLot && <div className="flex justify-end"><Select value={sortBy} onValueChange={setSortBy}><SelectTrigger className="h-9 w-[145px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">적용요일순</SelectItem><SelectItem value="start">시작시간순</SelectItem><SelectItem value="effective_new">최근 시행순</SelectItem><SelectItem value="name">설정명순</SelectItem></SelectContent></Select></div>}
            {!selectedLot ? <Card><CardContent className="py-16 text-center text-muted-foreground">좌측에서 주차장을 선택하세요</CardContent></Card> :
            (settings || []).length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">설정된 무료개방 없음</CardContent></Card> :
            sortedSettings.map((s: any) => (
              <Card key={s.id} className="cursor-pointer hover:shadow-sm" onClick={() => openEdit(s)}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.setting_name || "무료개방"}</span>
                      <Badge variant="outline" className="text-[10px]">{DAY_TYPE_LABELS[s.day_type] || s.day_type}</Badge>
                      <span className="text-sm font-mono">{s.start_time?.slice(0, 5)} ~ {s.end_time?.slice(0, 5)}</span>
                    </div>
                    <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} onClick={e => e.stopPropagation()} />
                  </div>
                  {s.reason && <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "설정 수정" : "설정 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">설정명</Label><Input value={form.setting_name || ""} onChange={e => set("setting_name", e.target.value)} placeholder="예: 야간 무료개방" /></div>
            <div className="space-y-1.5"><Label className="text-xs">적용</Label>
              <RadioGroup value={form.day_type || "everyday"} onValueChange={v => set("day_type", v)} className="flex flex-wrap gap-3">
                {Object.entries(DAY_TYPE_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-2"><RadioGroupItem value={k} id={`fh-${k}`} /><Label htmlFor={`fh-${k}`} className="text-sm font-normal">{v}</Label></div>
                ))}
              </RadioGroup>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">시작시간</Label><Input type="time" value={form.start_time || ""} onChange={e => set("start_time", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">종료시간</Label><Input type="time" value={form.end_time || ""} onChange={e => set("end_time", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">사유</Label><Input value={form.reason || ""} onChange={e => set("reason", e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">시행일</Label><Input type="date" value={form.effective_from || ""} onChange={e => set("effective_from", e.target.value)} /></div>
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
