import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { MARKING_TYPE_LABELS, CONDITION_LABELS, CONDITION_COLORS } from "@/types/facility";
import type { SurfaceMarking, MarkingCondition } from "@/types/facility";

export default function FacilityMarkings() {
  const queryClient = useQueryClient();
  const [selectedLot, setSelectedLot] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => { const { data } = await supabase.from("parking_lots").select("id, code, name").order("name"); return data ?? []; },
  });

  const { data: markings = [], isLoading } = useQuery({
    queryKey: ["facility-markings", selectedLot],
    queryFn: async () => {
      let q = supabase.from("surface_markings").select("*, parking_lots(code, name)").order("marking_type");
      if (selectedLot) q = q.eq("lot_id", selectedLot);
      const { data } = await q;
      return (data ?? []) as unknown as SurfaceMarking[];
    },
  });

  const [form, setForm] = useState({
    marking_type: '', marking_name: '', location_detail: '', floor: '', quantity: '1',
    material: '', color: '', condition: 'good' as MarkingCondition,
    install_date: '', last_repainted: '', repaint_cycle_months: '', is_regulatory: false, regulation_ref: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const nextDue = form.last_repainted && form.repaint_cycle_months
        ? (() => { const d = new Date(form.last_repainted); d.setMonth(d.getMonth() + parseInt(form.repaint_cycle_months)); return d.toISOString().split('T')[0]; })()
        : null;
      const { error } = await supabase.from("surface_markings").insert({
        lot_id: selectedLot,
        marking_type: form.marking_type,
        marking_name: form.marking_name,
        location_detail: form.location_detail || null,
        floor: form.floor ? parseInt(form.floor) : null,
        quantity: parseInt(form.quantity) || 1,
        material: form.material || null,
        color: form.color || null,
        condition: form.condition,
        install_date: form.install_date || null,
        last_repainted: form.last_repainted || null,
        repaint_cycle_months: form.repaint_cycle_months ? parseInt(form.repaint_cycle_months) : null,
        next_due: nextDue,
        is_regulatory: form.is_regulatory,
        regulation_ref: form.regulation_ref || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("노면표시가 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-markings"] });
      setDialogOpen(false);
      setForm({ marking_type: '', marking_name: '', location_detail: '', floor: '', quantity: '1', material: '', color: '', condition: 'good', install_date: '', last_repainted: '', repaint_cycle_months: '', is_regulatory: false, regulation_ref: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const dDay = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
    return diff <= 0 ? 'D-day' : `D-${diff}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">노면표시/안내표지판</h1>
          {selectedLot && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />등록</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>노면표시 등록</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>유형 *</Label>
                    <Select value={form.marking_type} onValueChange={v => setForm(p => ({ ...p, marking_type: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{Object.entries(MARKING_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>명칭 *</Label><Input value={form.marking_name} onChange={e => setForm(p => ({ ...p, marking_name: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>위치 상세</Label><Input value={form.location_detail} onChange={e => setForm(p => ({ ...p, location_detail: e.target.value }))} /></div>
                    <div><Label>층</Label><Input type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>수량</Label><Input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} /></div>
                    <div><Label>재질</Label><Input value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} /></div>
                    <div><Label>색상</Label><Input value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} /></div>
                  </div>
                  <div>
                    <Label>상태</Label>
                    <Select value={form.condition} onValueChange={(v: MarkingCondition) => setForm(p => ({ ...p, condition: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(CONDITION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>설치일</Label><Input type="date" value={form.install_date} onChange={e => setForm(p => ({ ...p, install_date: e.target.value }))} /></div>
                    <div><Label>최종 시공일</Label><Input type="date" value={form.last_repainted} onChange={e => setForm(p => ({ ...p, last_repainted: e.target.value }))} /></div>
                  </div>
                  <div><Label>재시공 주기 (개월)</Label><Input type="number" value={form.repaint_cycle_months} onChange={e => setForm(p => ({ ...p, repaint_cycle_months: e.target.value }))} /></div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_regulatory} onCheckedChange={v => setForm(p => ({ ...p, is_regulatory: v }))} />
                    <Label>법적 의무 표시</Label>
                  </div>
                  {form.is_regulatory && <div><Label>관련 규정</Label><Input value={form.regulation_ref} onChange={e => setForm(p => ({ ...p, regulation_ref: e.target.value }))} /></div>}
                  <Button className="w-full" disabled={!form.marking_type || !form.marking_name || createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? '등록 중...' : '등록'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid md:grid-cols-[240px_1fr] gap-4">
          <Card>
            <CardContent className="p-2">
              <p className="text-xs font-medium text-muted-foreground mb-2 px-2">주차장 선택</p>
              <div className="space-y-0.5">
                <button className={`w-full text-left px-3 py-2 text-sm rounded-md ${!selectedLot ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => setSelectedLot("")}>전체</button>
                {lots.map((l: any) => (
                  <button key={l.id} className={`w-full text-left px-3 py-2 text-sm rounded-md ${selectedLot === l.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => setSelectedLot(l.id)}>{l.name}</button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>유형</TableHead><TableHead>명칭</TableHead><TableHead>위치</TableHead>
                    <TableHead>상태</TableHead><TableHead>최종시공</TableHead><TableHead>재시공예정</TableHead><TableHead>법적</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markings.map(m => {
                    const isDue = m.next_due && new Date(m.next_due) <= in30;
                    return (
                      <TableRow key={m.id} className={isDue ? 'bg-yellow-50' : ''}>
                        <TableCell><Badge variant="outline">{MARKING_TYPE_LABELS[m.marking_type] || m.marking_type}</Badge></TableCell>
                        <TableCell className="font-medium">{m.marking_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.location_detail || '-'}</TableCell>
                        <TableCell><Badge className={CONDITION_COLORS[m.condition]}>{CONDITION_LABELS[m.condition]}</Badge></TableCell>
                        <TableCell className="text-sm">{m.last_repainted || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {m.next_due || '-'}
                          {isDue && <Badge variant="destructive" className="ml-1 text-xs">{dDay(m.next_due!)}</Badge>}
                        </TableCell>
                        <TableCell>{m.is_regulatory ? <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" /> : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {markings.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{isLoading ? '로딩 중...' : selectedLot ? '등록된 노면표시가 없습니다' : '좌측에서 주차장을 선택하세요'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
