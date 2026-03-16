import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ChevronLeft, ChevronRight, Calendar, List } from "lucide-react";
import { toast } from "sonner";
import { SCHEDULE_TYPE_LABELS } from "@/types/facility";
import type { MaintenanceSchedule } from "@/types/facility";

const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  daily: 'bg-blue-500', weekly: 'bg-green-500', monthly: 'bg-yellow-500',
  quarterly: 'bg-orange-500', semi_annual: 'bg-purple-500', yearly: 'bg-red-500',
};

export default function FacilitySchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => { const { data } = await supabase.from("parking_lots").select("id, code, name").order("name"); return data ?? []; },
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["facility-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_schedules")
        .select("*, parking_lots(code, name), equipment(name, equipment_type), assignee:profiles!maintenance_schedules_assigned_to_fkey(name)")
        .order("next_due_date");

      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceSchedule[];
    },
  });

  const [form, setForm] = useState({
    schedule_name: '', lot_id: '', schedule_type: 'monthly', next_due_date: '',
    advance_notice_days: '7', description: '', is_active: true,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("maintenance_schedules").insert({
        schedule_name: form.schedule_name,
        lot_id: form.lot_id,
        schedule_type: form.schedule_type,
        next_due_date: form.next_due_date,
        advance_notice_days: parseInt(form.advance_notice_days) || 7,
        description: form.description || null,
        is_active: form.is_active,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("스케줄이 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-schedules"] });
      setDialogOpen(false);
      setForm({ schedule_name: '', lot_id: '', schedule_type: 'monthly', next_due_date: '', advance_notice_days: '7', description: '', is_active: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Calendar logic
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const schedulesMap = useMemo(() => {
    const map: Record<string, MaintenanceSchedule[]> = {};
    schedules.forEach(s => {
      if (!s.next_due_date) return;
      const d = new Date(s.next_due_date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = d.getDate().toString();
        if (!map[key]) map[key] = [];
        map[key].push(s);
      }
    });
    return map;
  }, [schedules, year, month]);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">점검 스케줄</h1>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'calendar' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('calendar')}><Calendar className="h-4 w-4" /></Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />스케줄 등록</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>점검 스케줄 등록</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>점검명 *</Label><Input value={form.schedule_name} onChange={e => setForm(p => ({ ...p, schedule_name: e.target.value }))} placeholder="예: 공항입구 차단기 월간점검" /></div>
                  <div>
                    <Label>주차장 *</Label>
                    <Select value={form.lot_id} onValueChange={v => setForm(p => ({ ...p, lot_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{lots.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>점검 주기</Label>
                    <Select value={form.schedule_type} onValueChange={v => setForm(p => ({ ...p, schedule_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(SCHEDULE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>다음 점검일 *</Label><Input type="date" value={form.next_due_date} onChange={e => setForm(p => ({ ...p, next_due_date: e.target.value }))} /></div>
                  <div><Label>사전 알림 (일)</Label><Input type="number" value={form.advance_notice_days} onChange={e => setForm(p => ({ ...p, advance_notice_days: e.target.value }))} /></div>
                  <div><Label>설명</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} /><Label>활성</Label></div>
                  <Button className="w-full" disabled={!form.schedule_name || !form.lot_id || !form.next_due_date || createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? '등록 중...' : '등록'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <CardTitle>{year}년 {month + 1}월</CardTitle>
                <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px bg-border">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                  <div key={d} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="bg-background p-2 min-h-[80px]" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                  const daySchedules = schedulesMap[day.toString()] || [];
                  return (
                    <div key={day} className={`bg-background p-2 min-h-[80px] ${isToday ? 'ring-2 ring-primary ring-inset' : ''}`}>
                      <span className={`text-sm ${isToday ? 'font-bold text-primary' : ''}`}>{day}</span>
                      {daySchedules.slice(0, 3).map(s => (
                        <div key={s.id} className={`mt-1 text-[10px] rounded px-1 py-0.5 text-white truncate ${SCHEDULE_TYPE_COLORS[s.schedule_type] || 'bg-gray-400'}`}>
                          {s.schedule_name}
                        </div>
                      ))}
                      {daySchedules.length > 3 && <div className="text-[10px] text-muted-foreground mt-0.5">+{daySchedules.length - 3}건</div>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>점검명</TableHead><TableHead>주차장</TableHead><TableHead>장비</TableHead>
                    <TableHead>주기</TableHead><TableHead>담당자</TableHead><TableHead>다음점검일</TableHead><TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.schedule_name}</TableCell>
                      <TableCell>{s.parking_lots?.name || '-'}</TableCell>
                      <TableCell>{s.equipment?.name || '-'}</TableCell>
                      <TableCell><Badge className={`text-white ${SCHEDULE_TYPE_COLORS[s.schedule_type] || 'bg-gray-400'}`}>{SCHEDULE_TYPE_LABELS[s.schedule_type] || s.schedule_type}</Badge></TableCell>
                      <TableCell>{s.assignee?.name || '-'}</TableCell>
                      <TableCell>{s.next_due_date}</TableCell>
                      <TableCell><Badge variant={s.is_active ? 'default' : 'secondary'}>{s.is_active ? '활성' : '비활성'}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {schedules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{isLoading ? '로딩 중...' : '등록된 스케줄이 없습니다'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
