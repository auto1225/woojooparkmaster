import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, Calendar, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { ScheduleCalendarView } from "@/components/facility/ScheduleCalendarView";
import { ScheduleDetailSheet } from "@/components/facility/ScheduleDetailSheet";
import { ScheduleListView } from "@/components/facility/ScheduleListView";
import { SCHEDULE_TYPE_LABELS } from "@/types/facility";
import type { MaintenanceSchedule } from "@/types/facility";

export default function FacilitySchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").order("name");
      return data ?? [];
    },
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

  const selectedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null,
    [schedules, selectedScheduleId],
  );

  useEffect(() => {
    if (selectedScheduleId && !selectedSchedule) {
      setDetailOpen(false);
      setSelectedScheduleId(null);
    }
  }, [selectedSchedule, selectedScheduleId]);

  const [form, setForm] = useState({
    schedule_name: "",
    lot_id: "",
    schedule_type: "monthly",
    next_due_date: "",
    advance_notice_days: "7",
    description: "",
    is_active: true,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("maintenance_schedules").insert({
        schedule_name: form.schedule_name,
        lot_id: form.lot_id,
        schedule_type: form.schedule_type,
        next_due_date: form.next_due_date,
        advance_notice_days: parseInt(form.advance_notice_days, 10) || 7,
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
      setForm({
        schedule_name: "",
        lot_id: "",
        schedule_type: "monthly",
        next_due_date: "",
        advance_notice_days: "7",
        description: "",
        is_active: true,
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const monthLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(currentMonth);

  const openScheduleDetail = (schedule: MaintenanceSchedule) => {
    setSelectedScheduleId(schedule.id);
    setDetailOpen(true);
  };

  const prevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">점검 스케줄</h1>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("calendar")}
              aria-label="달력 보기"
            >
              <Calendar className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
              aria-label="목록 보기"
            >
              <List className="h-4 w-4" />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />스케줄 등록
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>점검 스케줄 등록</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>점검명 *</Label>
                    <Input
                      value={form.schedule_name}
                      onChange={(event) => setForm((prev) => ({ ...prev, schedule_name: event.target.value }))}
                      placeholder="예: 공항입구 차단기 월간점검"
                    />
                  </div>
                  <div>
                    <Label>주차장 *</Label>
                    <Select value={form.lot_id} onValueChange={(value) => setForm((prev) => ({ ...prev, lot_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {lots.map((lot: { id: string; name: string }) => (
                          <SelectItem key={lot.id} value={lot.id}>
                            {lot.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>점검 주기</Label>
                    <Select
                      value={form.schedule_type}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, schedule_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SCHEDULE_TYPE_LABELS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>다음 점검일 *</Label>
                    <Input
                      type="date"
                      value={form.next_due_date}
                      onChange={(event) => setForm((prev) => ({ ...prev, next_due_date: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>사전 알림 (일)</Label>
                    <Input
                      type="number"
                      value={form.advance_notice_days}
                      onChange={(event) => setForm((prev) => ({ ...prev, advance_notice_days: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>설명</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      rows={2}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))} />
                    <Label>활성</Label>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!form.schedule_name || !form.lot_id || !form.next_due_date || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "등록 중..." : "등록"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="이전 달">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle>{monthLabel}</CardTitle>
              <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="다음 달">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className={viewMode === "list" ? "p-0" : undefined}>
            {viewMode === "calendar" ? (
              <ScheduleCalendarView
                currentMonth={currentMonth}
                isLoading={isLoading}
                schedules={schedules}
                selectedScheduleId={selectedScheduleId}
                onSelectSchedule={openScheduleDetail}
              />
            ) : (
              <ScheduleListView
                isLoading={isLoading}
                schedules={schedules}
                selectedScheduleId={selectedScheduleId}
                onSelectSchedule={openScheduleDetail}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ScheduleDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        schedule={selectedSchedule}
      />
    </DashboardLayout>
  );
}
