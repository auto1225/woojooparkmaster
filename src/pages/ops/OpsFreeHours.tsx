import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Trash2, Search } from "lucide-react";

export default function OpsFreeHoursPage() {
  const queryClient = useQueryClient();
  const [selectedLot, setSelectedLot] = useState("");
  const [lotSearch, setLotSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const { data: lots } = useQuery({ queryKey: ["lots-for-ops"], queryFn: async () => {
    const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
    return data || [];
  }});

  const { data: settings } = useQuery({ queryKey: ["free-hours", selectedLot], queryFn: async () => {
    if (!selectedLot) return [];
    const { data } = await supabase.from("free_hours_settings").select("*").eq("lot_id", selectedLot).order("day_type");
    return data || [];
  }, enabled: !!selectedLot });

  const filteredLots = (lots || []).filter((l: any) => !lotSearch || l.name.toLowerCase().includes(lotSearch.toLowerCase()));
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm({ lot_id: selectedLot, day_type: "everyday", is_active: true, effective_from: new Date().toISOString().split("T")[0] }); setDialogOpen(true); };
  const openEdit = (s: any) => { setEditing(s); setForm({ ...s }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.lot_id || !form.start_time || !form.end_time) { toast({ title: "필수 입력 확인", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { id, parking_lots, created_at, ...payload } = form;
      if (editing) await supabase.from("free_hours_settings").update(payload).eq("id", editing.id);
      else await supabase.from("free_hours_settings").insert(payload);
      toast({ title: "저장됨" });
      queryClient.invalidateQueries({ queryKey: ["free-hours"] });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "실패", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editing) return;
    await supabase.from("free_hours_settings").delete().eq("id", editing.id);
    toast({ title: "삭제됨" });
    queryClient.invalidateQueries({ queryKey: ["free-hours"] });
    setDialogOpen(false);
  };

  const toggleActive = async (s: any) => {
    await supabase.from("free_hours_settings").update({ is_active: !s.is_active }).eq("id", s.id);
    queryClient.invalidateQueries({ queryKey: ["free-hours"] });
  };

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
              <div className="p-3"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="주차장 검색" value={lotSearch} onChange={e => setLotSearch(e.target.value)} className="pl-9 h-9" /></div></div>
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredLots.map((l: any) => (
                  <button key={l.id} onClick={() => setSelectedLot(l.id)} className={`w-full px-4 py-2.5 text-left text-sm border-b hover:bg-accent/50 ${selectedLot === l.id ? "bg-primary/10 font-medium" : ""}`}>
                    <span className="font-mono text-[10px] text-muted-foreground mr-2">{l.code}</span>{l.name}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-3">
            {!selectedLot ? <Card><CardContent className="py-16 text-center text-muted-foreground">좌측에서 주차장을 선택하세요</CardContent></Card> :
            (settings || []).length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">설정된 무료개방 없음</CardContent></Card> :
            (settings || []).map((s: any) => (
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
