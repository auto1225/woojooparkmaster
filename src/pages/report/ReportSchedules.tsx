import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Plus, Play, Edit, Trash2, Calendar, Clock, Users } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { FREQUENCY_LABELS, type ReportTemplate } from "@/types/report";

export default function ReportSchedules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    schedule_name: "",
    template_id: "",
    frequency: "monthly",
    day_of_week: 1,
    day_of_month: 1,
    execution_time: "06:00",
    output_format: "pdf",
    include_excel: false,
    recipients: "[]",
    send_method: "notification",
  });

  const { data: templates } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").order("sort_order");
      if (error) throw error;
      return data as any as ReportTemplate[];
    },
  });

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["report-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_schedules")
        .select("*, template:report_templates(name, template_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      let nextRun = new Date(now);
      nextRun.setHours(parseInt(form.execution_time.split(":")[0]), parseInt(form.execution_time.split(":")[1]), 0, 0);
      if (form.frequency === "daily") { if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1); }
      else if (form.frequency === "weekly") { while (nextRun.getDay() !== form.day_of_week % 7 || nextRun <= now) nextRun.setDate(nextRun.getDate() + 1); }
      else if (form.frequency === "monthly") { nextRun.setDate(form.day_of_month); if (nextRun <= now) nextRun.setMonth(nextRun.getMonth() + 1); }

      const { error } = await supabase.from("report_schedules").insert({
        schedule_name: form.schedule_name,
        template_id: form.template_id,
        frequency: form.frequency,
        day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
        day_of_month: ["monthly", "quarterly", "semi_annual", "yearly"].includes(form.frequency) ? form.day_of_month : null,
        execution_time: form.execution_time,
        output_format: form.output_format,
        include_excel: form.include_excel,
        recipients: JSON.parse(form.recipients || "[]"),
        send_method: form.send_method,
        next_run: nextRun.toISOString(),
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      setDialogOpen(false);
      toast.success("스케줄이 등록되었습니다");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("report_schedules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report-schedules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("삭제되었습니다");
    },
  });

  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">정기 보고서 스케줄</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />스케줄 등록</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>스케줄 등록</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>스케줄명</Label><Input value={form.schedule_name} onChange={(e) => setForm({ ...form, schedule_name: e.target.value })} placeholder="월간 운영 보고서 자동 생성" /></div>
                <div>
                  <Label>보고서 템플릿</Label>
                  <Select value={form.template_id} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>주기</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.frequency === "weekly" && (
                  <div><Label>요일</Label>
                    <Select value={String(form.day_of_week)} onValueChange={(v) => setForm({ ...form, day_of_week: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {["monthly", "quarterly", "semi_annual", "yearly"].includes(form.frequency) && (
                  <div><Label>일</Label><Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} /></div>
                )}
                <div><Label>실행 시간</Label><Input type="time" value={form.execution_time} onChange={(e) => setForm({ ...form, execution_time: e.target.value })} /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.include_excel} onCheckedChange={(c) => setForm({ ...form, include_excel: c })} />
                  <Label>엑셀 포함</Label>
                </div>
                <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!form.schedule_name || !form.template_id}>등록</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!schedules?.length && !isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">등록된 스케줄이 없습니다</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules?.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{s.schedule_name}</h3>
                      <p className="text-xs text-muted-foreground">{s.template?.name}</p>
                    </div>
                    <Switch checked={s.is_active} onCheckedChange={(c) => toggleMutation.mutate({ id: s.id, is_active: c })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      <Calendar className="h-3 w-3 mr-1" />{FREQUENCY_LABELS[s.frequency] || s.frequency}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      <Clock className="h-3 w-3 mr-1" />{s.execution_time || "06:00"}
                    </Badge>
                    {s.next_run && (
                      <Badge variant="outline" className="text-[10px]">다음: {new Date(s.next_run).toLocaleDateString("ko-KR")}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>실행 {s.run_count}회</span>
                    {s.fail_count > 0 && <span className="text-destructive">실패 {s.fail_count}회</span>}
                    {s.last_run && <span>· 최근: {new Date(s.last_run).toLocaleDateString("ko-KR")}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/reports/generate?template=${s.template?.template_code}`)}>
                      <Play className="h-3.5 w-3.5 mr-1" />수동 실행
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
