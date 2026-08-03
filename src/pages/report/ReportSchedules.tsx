import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Play, Trash2, Calendar, Clock, Loader2, Pencil, CircleAlert, Search, Info } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { FREQUENCY_LABELS, type ReportTemplate } from "@/types/report";
import { runReportSchedule } from "@/lib/report-engine";
import { calculateNextReportRun, type ReportFrequency } from "@/lib/report-schedule";

export default function ReportSchedules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("next_run");
  const [form, setForm] = useState({
    schedule_name: "",
    template_id: "",
    frequency: "monthly",
    day_of_week: 1,
    day_of_month: 1,
    month_of_year: 1,
    execution_time: "06:00",
    output_format: "pdf",
    include_excel: false,
    recipients: "[]",
    send_method: "notification",
    author_name: "",
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({ schedule_name: "", template_id: "", frequency: "monthly", day_of_week: 1, day_of_month: 1, month_of_year: 1, execution_time: "06:00", output_format: "pdf", include_excel: false, recipients: "[]", send_method: "notification", author_name: "" });
  };

  const { data: templates, error: templatesError } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_templates").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as any as ReportTemplate[];
    },
  });

  const { data: schedules, isLoading, error: schedulesError } = useQuery({
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.schedule_name.trim() || !form.template_id) throw new Error("스케줄명과 보고서 템플릿을 선택해 주세요.");
      const nextRun = calculateNextReportRun({
        frequency: form.frequency as ReportFrequency,
        executionTime: form.execution_time,
        dayOfWeek: form.day_of_week,
        dayOfMonth: form.day_of_month,
        monthOfYear: form.month_of_year,
      });
      const payload = {
        schedule_name: form.schedule_name,
        template_id: form.template_id,
        frequency: form.frequency,
        day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
        day_of_month: ["monthly", "quarterly", "semi_annual", "yearly"].includes(form.frequency) ? form.day_of_month : null,
        month_of_year: ["quarterly", "semi_annual", "yearly"].includes(form.frequency) ? form.month_of_year : null,
        execution_time: form.execution_time,
        output_format: form.output_format,
        include_excel: form.include_excel,
        recipients: JSON.parse(form.recipients || "[]"),
        send_method: form.send_method,
        next_run: nextRun.toISOString(),
        author_name: form.author_name.trim() || null,
        created_by: user?.id,
      };
      const request = editingId
        ? supabase.from("report_schedules").update(payload).eq("id", editingId)
        : supabase.from("report_schedules").insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      setDialogOpen(false);
      toast.success(editingId ? "스케줄을 수정했습니다" : "스케줄이 등록되었습니다");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editSchedule = (schedule: any) => {
    setEditingId(schedule.id);
    setForm({
      schedule_name: schedule.schedule_name || "",
      template_id: schedule.template_id || "",
      frequency: schedule.frequency || "monthly",
      day_of_week: schedule.day_of_week ?? 1,
      day_of_month: schedule.day_of_month ?? 1,
      month_of_year: schedule.month_of_year ?? 1,
      execution_time: String(schedule.execution_time || "06:00").slice(0, 5),
      output_format: schedule.output_format || "pdf",
      include_excel: Boolean(schedule.include_excel),
      recipients: JSON.stringify(schedule.recipients || []),
      send_method: schedule.send_method || "notification",
      author_name: schedule.author_name || "",
    });
    setDialogOpen(true);
  };

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

  const runMutation = useMutation({
    mutationFn: async (schedule: any) => {
      if (!user) throw new Error("로그인이 필요합니다.");
      return runReportSchedule(schedule, user.id, false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["report-history"] });
      toast.success("정기 보고서를 생성했습니다");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const visibleSchedules = [...(schedules || [])]
    .filter((schedule: any) => {
      const query = searchTerm.trim().toLocaleLowerCase("ko-KR");
      const matchesSearch = !query || [schedule.schedule_name, schedule.template?.name, schedule.author_name]
        .some((value) => String(value || "").toLocaleLowerCase("ko-KR").includes(query));
      const matchesFrequency = frequencyFilter === "all" || schedule.frequency === frequencyFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && schedule.is_active)
        || (statusFilter === "inactive" && !schedule.is_active)
        || (statusFilter === "failed" && schedule.last_status === "failed");
      return matchesSearch && matchesFrequency && matchesStatus;
    })
    .sort((left: any, right: any) => {
      if (sortBy === "name") return String(left.schedule_name).localeCompare(String(right.schedule_name), "ko-KR");
      if (sortBy === "recent") return new Date(right.last_run || 0).getTime() - new Date(left.last_run || 0).getTime();
      if (sortBy === "failures") return Number(right.fail_count || 0) - Number(left.fail_count || 0);
      return new Date(left.next_run || "9999-12-31").getTime() - new Date(right.next_run || "9999-12-31").getTime();
    });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">정기 보고서 스케줄</h1>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm" onClick={resetForm}><Plus className="h-4 w-4 mr-1" />스케줄 등록</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingId ? "스케줄 수정" : "스케줄 등록"}</DialogTitle></DialogHeader>
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
                {["quarterly", "semi_annual", "yearly"].includes(form.frequency) && (
                  <div><Label>기준 월</Label>
                    <Select value={String(form.month_of_year)} onValueChange={(value) => setForm({ ...form, month_of_year: Number(value) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{index + 1}월</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">분기·반기 보고서는 이 달부터 각 주기만큼 반복합니다.</p>
                  </div>
                )}
                <div><Label>실행 시간</Label><Input type="time" value={form.execution_time} onChange={(e) => setForm({ ...form, execution_time: e.target.value })} /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.include_excel} onCheckedChange={(c) => setForm({ ...form, include_excel: c })} />
                  <Label>엑셀 포함</Label>
                </div>
                <AuthorField value={form.author_name} onChange={v => setForm(prev => ({ ...prev, author_name: v }))} />
                <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.schedule_name || !form.template_id}>
                  {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{editingId ? "수정 저장" : "등록"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>예약 보고서는 관리자 또는 매니저가 프로그램에 접속해 있을 때 최대 5분 이내 생성됩니다. 완료 알림은 프로그램에서 제공하며 외부 이메일 자동 발송은 제공하지 않습니다.</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_160px_160px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="예약명, 템플릿, 작성자 검색" />
          </div>
          <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
            <SelectTrigger><SelectValue placeholder="전체 주기" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 주기</SelectItem>
              {Object.entries(FREQUENCY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="전체 상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="active">사용 중</SelectItem>
              <SelectItem value="inactive">중지</SelectItem>
              <SelectItem value="failed">최근 실패</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="next_run">다음 실행 빠른 순</SelectItem>
              <SelectItem value="recent">최근 실행 순</SelectItem>
              <SelectItem value="failures">실패 많은 순</SelectItem>
              <SelectItem value="name">예약명 순</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(templatesError || schedulesError) && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <CircleAlert className="h-4 w-4 shrink-0" />보고서 예약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {!schedules?.length && !isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">등록된 스케줄이 없습니다</div>
        ) : !visibleSchedules.length ? (
          <div className="py-12 text-center text-muted-foreground text-sm">검색 조건에 맞는 예약이 없습니다</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleSchedules.map((s: any) => (
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
                      <Badge variant="outline" className="text-[10px]">다음: {new Date(s.next_run).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>실행 {s.run_count}회</span>
                    {s.fail_count > 0 && <span className="text-destructive">실패 {s.fail_count}회</span>}
                    {s.last_run && <span>· 최근: {new Date(s.last_run).toLocaleDateString("ko-KR")}</span>}
                  </div>
                  {s.last_status === "failed" && <p className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700"><CircleAlert className="h-3.5 w-3.5" />{s.last_error || "최근 실행이 실패했습니다."}</p>}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runMutation.isPending}
                      onClick={() => runMutation.mutate(s)}
                    >
                      {runMutation.isPending && runMutation.variables?.id === s.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <Play className="h-3.5 w-3.5 mr-1" />}
                      수동 실행
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => editSchedule(s)}><Pencil className="mr-1 h-3.5 w-3.5" />수정</Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      title="예약 삭제"
                      onClick={() => window.confirm(`'${s.schedule_name}' 예약을 삭제하시겠습니까? 생성된 보고서는 삭제되지 않습니다.`) && deleteMutation.mutate(s.id)}
                    >
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
