import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiCard } from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cpu, CheckCircle, WifiOff, BatteryLow, AlertTriangle, Plus, Wrench, Radar, Loader2 } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { SENSOR_TYPE_LABELS, SENSOR_STATUS_LABELS, SENSOR_STATUS_COLORS, MOUNTING_TYPE_LABELS } from "@/types/realtime";
import { advanceSensorIncident } from "@/lib/workflow-commands";
import { useNavigate } from "react-router-dom";

const STATUS_SORT: Record<string, number> = { error: 0, offline: 1, low_battery: 2, active: 3, maintenance: 4, decommissioned: 5 };

export default function RealtimeSensors() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);
  const [lotFilter, setLotFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [showRegister, setShowRegister] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [recoveryNote, setRecoveryNote] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
      return data || [];
    },
  });

  const { data: gateways } = useQuery({
    queryKey: ["gateways-simple", form.lot_id],
    queryFn: async () => {
      let q = supabase.from("gateway_devices").select("id, device_id, device_name, lot_id");
      if (form.lot_id) q = q.eq("lot_id", form.lot_id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!form.lot_id,
  });

  const { data: sensors, isLoading } = useQuery({
    queryKey: ["sensors-list", lotFilter, statusFilter],
    queryFn: async () => {
      let q = supabase.from("sensor_devices")
        .select("*, parking_lots(code, name), gateway_devices(device_id)")
        .order("status").order("last_heartbeat", { ascending: true });
      if (lotFilter !== "__all__") q = q.eq("lot_id", lotFilter);
      if (statusFilter !== "__all__") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: incidents } = useQuery({
    queryKey: ["sensor-incidents"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sensor_incidents")
        .select("*, sensor_devices(device_id, device_name), parking_lots(name), maintenance_logs(log_number, status)")
        .in("status", ["open", "acknowledged", "recovery_detected"])
        .order("first_detected_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const monitorMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("monitor_sensor_anomalies");
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["sensor-incidents"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-logs"] });
      toast({ title: `이상 탐지 완료`, description: `신규 ${data?.created || 0}건, 갱신 ${data?.updated || 0}건` });
    },
    onError: (error: Error) => toast({ title: "이상 탐지 실패", description: error.message, variant: "destructive" }),
  });

  const incidentMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "acknowledge" | "confirm_recovery"; note?: string }) =>
      advanceSensorIncident(id, action, note),
    onSuccess: () => {
      setRecoveryNote("");
      queryClient.invalidateQueries({ queryKey: ["sensor-incidents"] });
      toast({ title: "센서 사건 상태를 변경했습니다" });
    },
    onError: (error: Error) => toast({ title: "사건 처리 실패", description: error.message, variant: "destructive" }),
  });

  const sorted = [...(sensors || [])].sort((a, b) => (STATUS_SORT[a.status] ?? 9) - (STATUS_SORT[b.status] ?? 9));

  const totalCount = sorted.length;
  const activeCount = sorted.filter(s => s.status === 'active').length;
  const offlineCount = sorted.filter(s => {
    if (!s.last_heartbeat) return s.status === 'offline';
    return new Date(s.last_heartbeat) < new Date(Date.now() - 30 * 60 * 1000);
  }).length;
  const lowBatteryCount = sorted.filter(s => s.battery_level != null && Number(s.battery_level) < 20).length;
  const errorCount = sorted.filter(s => s.status === 'error').length;
  const incidentBySensor = new Map((incidents || []).map((incident: any) => [incident.sensor_id, incident]));
  const detailIncident = showDetail ? incidentBySensor.get(showDetail.id) as any : null;

  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleRegister = async () => {
    if (!form.lot_id || !form.device_id) {
      toast({ title: "필수 항목을 입력하세요", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("sensor_devices").insert({
      lot_id: form.lot_id,
      device_id: form.device_id,
      device_name: form.device_name || null,
      device_type: form.device_type || 'radar_60ghz',
      gateway_id: form.gateway_id || null,
      floor: form.floor ? Number(form.floor) : null,
      zone: form.zone || null,
      location_detail: form.location_detail || null,
      mounting_type: form.mounting_type || null,
      mounting_height_cm: form.mounting_height_cm ? Number(form.mounting_height_cm) : null,
      install_date: form.install_date || null,
      author_name: form.author_name || null,
    });
    if (error) {
      toast({ title: "등록 실패", description: error.message, variant: "destructive" });
    } else {
      await logActivity({ module: "realtime", action: "create", targetType: "sensor", targetName: form.device_id });
      toast({ title: "센서가 등록되었습니다" });
      setShowRegister(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ["sensors-list"] });
    }
  };

  const minutesAgo = (ts?: string | null) => {
    if (!ts) return "—";
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (diff < 1) return "방금";
    if (diff < 60) return `${diff}분 전`;
    return `${Math.round(diff / 60)}시간 전`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">센서 모니터링</h2>
            <p className="text-sm text-muted-foreground">60GHz 레이더 센서 상태 관리</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => monitorMutation.mutate()} disabled={monitorMutation.isPending}>
                {monitorMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Radar className="h-4 w-4 mr-1" />}
                이상 탐지
              </Button>
            )}
            {canEdit && <Button onClick={() => setShowRegister(true)}><Plus className="h-4 w-4 mr-1" />센서 등록</Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="전체 센서" value={String(totalCount)} icon={Cpu} />
          <KpiCard label="정상 가동" value={String(activeCount)} icon={CheckCircle} />
          <KpiCard label="오프라인" value={String(offlineCount)} icon={WifiOff} />
          <KpiCard label="배터리 부족" value={String(lowBatteryCount)} icon={BatteryLow} />
          <KpiCard label="오류" value={String(errorCount)} icon={AlertTriangle} />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={lotFilter} onValueChange={setLotFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="주차장" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 주차장</SelectItem>
              {(lots || []).map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 상태</SelectItem>
              {Object.entries(SENSOR_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!!incidents?.length && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />미종결 센서 사건 {incidents.length}건
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>사건번호</TableHead><TableHead>센서</TableHead><TableHead>주차장</TableHead>
                  <TableHead>이상</TableHead><TableHead>탐지</TableHead><TableHead>상태</TableHead><TableHead>조치</TableHead>
                </TableRow></TableHeader>
                <TableBody>{incidents.map((incident: any) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-mono text-xs">{incident.incident_number}</TableCell>
                    <TableCell className="font-mono text-xs">{incident.sensor_devices?.device_id}</TableCell>
                    <TableCell className="text-sm">{incident.parking_lots?.name || "-"}</TableCell>
                    <TableCell className="text-xs">{{ device_error: "장치 오류", offline: "통신 두절", low_battery: "배터리 부족" }[incident.anomaly_type as string] || incident.anomaly_type}</TableCell>
                    <TableCell className="text-xs">{new Date(incident.first_detected_at).toLocaleString("ko-KR")}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">
                      {{ open: "미접수", acknowledged: "조치 중", recovery_detected: "복구 확인 대기" }[incident.status as string] || incident.status}
                    </Badge></TableCell>
                    <TableCell><div className="flex gap-1">
                      {incident.status === "open" && canEdit && (
                        <Button size="sm" variant="outline" onClick={() => incidentMutation.mutate({ id: incident.id, action: "acknowledge" })}>접수</Button>
                      )}
                      <Button size="icon" variant="ghost" title="연결 작업지시" onClick={() => navigate("/facility/maintenance")}>
                        <Wrench className="h-3.5 w-3.5" />
                      </Button>
                    </div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? <Skeleton className="h-64 m-4" /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>장치ID</TableHead>
                    <TableHead>주차장</TableHead>
                    <TableHead>구역</TableHead>
                    <TableHead>게이트웨이</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>배터리</TableHead>
                    <TableHead>신호</TableHead>
                    <TableHead>마지막 통신</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>사건</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(s => {
                    const battery = s.battery_level != null ? Number(s.battery_level) : null;
                    const isLowBat = battery != null && battery < 20;
                    const isOffline = s.last_heartbeat && new Date(s.last_heartbeat) < new Date(Date.now() - 30 * 60 * 1000);
                    return (
                      <TableRow key={s.id}
                        className={`cursor-pointer hover:bg-muted/50 ${isOffline ? 'bg-red-50/50' : ''}`}
                        onClick={() => setShowDetail(s)}>
                        <TableCell className="font-mono text-xs">{s.device_id}</TableCell>
                        <TableCell className="text-sm">{(s.parking_lots as any)?.name || '—'}</TableCell>
                        <TableCell className="text-xs">{s.zone || '—'}{s.floor != null ? ` / ${s.floor}F` : ''}</TableCell>
                        <TableCell className="text-xs font-mono">{(s.gateway_devices as any)?.device_id || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{SENSOR_TYPE_LABELS[s.device_type] || s.device_type}</Badge></TableCell>
                        <TableCell>
                          {battery != null ? (
                            <div className="flex items-center gap-1">
                              <Progress value={battery} className={`h-1.5 w-12 ${isLowBat ? '[&>div]:bg-red-500' : ''}`} />
                              <span className={`text-xs ${isLowBat ? 'text-red-600 font-bold' : ''}`}>{battery.toFixed(0)}%</span>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {incidentBySensor.has(s.id) && <Badge variant="destructive" className="text-[10px]">조치 필요</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{s.rssi != null ? `${s.rssi} dBm` : '—'}</TableCell>
                        <TableCell className="text-xs">{minutesAgo(s.last_heartbeat)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${SENSOR_STATUS_COLORS[s.status] || ''}`}>
                            {SENSOR_STATUS_LABELS[s.status] || s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!sorted.length && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">등록된 센서가 없습니다</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Register Dialog */}
        <Dialog open={showRegister} onOpenChange={setShowRegister}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>센서 등록</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>주차장 *</Label>
                <Select value={form.lot_id || ''} onValueChange={v => updateForm('lot_id', v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{(lots || []).map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>장치 ID *</Label>
                <Input value={form.device_id || ''} onChange={e => updateForm('device_id', e.target.value)} placeholder="센서 인쇄 ID" />
              </div>
              <div>
                <Label>장치명</Label>
                <Input value={form.device_name || ''} onChange={e => updateForm('device_name', e.target.value)} />
              </div>
              <div>
                <Label>센서 유형</Label>
                <Select value={form.device_type || 'radar_60ghz'} onValueChange={v => updateForm('device_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SENSOR_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>게이트웨이</Label>
                <Select value={form.gateway_id || '__none__'} onValueChange={v => updateForm('gateway_id', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">없음</SelectItem>
                    {(gateways || []).map(g => <SelectItem key={g.id} value={g.id}>{g.device_id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>설치 방식</Label>
                <Select value={form.mounting_type || '__none__'} onValueChange={v => updateForm('mounting_type', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">미지정</SelectItem>
                    {Object.entries(MOUNTING_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>설치 높이 (cm)</Label>
                <Input type="number" value={form.mounting_height_cm || ''} onChange={e => updateForm('mounting_height_cm', e.target.value)} />
              </div>
              <div>
                <Label>층</Label>
                <Input type="number" value={form.floor || ''} onChange={e => updateForm('floor', e.target.value)} />
              </div>
              <div>
                <Label>구역</Label>
                <Input value={form.zone || ''} onChange={e => updateForm('zone', e.target.value)} />
              </div>
              <div>
                <Label>설치일</Label>
                <Input type="date" value={form.install_date || ''} onChange={e => updateForm('install_date', e.target.value)} />
              </div>
              <div>
                <Label>상세 위치</Label>
                <Input value={form.location_detail || ''} onChange={e => updateForm('location_detail', e.target.value)} />
              </div>
              <div className="col-span-2">
                <AuthorField value={form.author_name || ""} onChange={v => updateForm('author_name', v)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRegister(false)}>취소</Button>
              <Button onClick={handleRegister}>등록</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>센서 상세 — {showDetail?.device_id}</DialogTitle></DialogHeader>
            {showDetail && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">장치명:</span> {showDetail.device_name || '—'}</div>
                  <div><span className="text-muted-foreground">유형:</span> {SENSOR_TYPE_LABELS[showDetail.device_type] || showDetail.device_type}</div>
                  <div><span className="text-muted-foreground">주차장:</span> {(showDetail.parking_lots as any)?.name}</div>
                  <div><span className="text-muted-foreground">구역:</span> {showDetail.zone || '—'}</div>
                  <div><span className="text-muted-foreground">설치방식:</span> {showDetail.mounting_type ? MOUNTING_TYPE_LABELS[showDetail.mounting_type] || showDetail.mounting_type : '—'}</div>
                  <div><span className="text-muted-foreground">총 읽기:</span> {(showDetail.total_readings || 0).toLocaleString()}</div>
                  <div><span className="text-muted-foreground">오류 횟수:</span> {showDetail.error_count || 0}</div>
                  <div><span className="text-muted-foreground">마지막 측정:</span> {minutesAgo(showDetail.last_reading)}</div>
                </div>
                {showDetail.battery_level != null && (
                  <div>
                    <Label className="text-xs">배터리</Label>
                    <div className="flex items-center gap-2">
                      <Progress value={Number(showDetail.battery_level)} className="h-3 flex-1" />
                      <span className="text-sm font-bold">{Number(showDetail.battery_level).toFixed(1)}%</span>
                    </div>
                  </div>
                )}
                <Badge className={`${SENSOR_STATUS_COLORS[showDetail.status] || ''}`}>
                  {SENSOR_STATUS_LABELS[showDetail.status] || showDetail.status}
                </Badge>
                {detailIncident && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{detailIncident.incident_number}</p>
                        <p className="text-xs text-muted-foreground">작업지시 {detailIncident.maintenance_logs?.log_number || "생성 대기"}</p>
                      </div>
                      <Badge variant="outline">{{ open: "미접수", acknowledged: "조치 중", recovery_detected: "복구 확인 대기" }[detailIncident.status as string]}</Badge>
                    </div>
                    {detailIncident.status === "open" && canEdit && (
                      <Button className="w-full" variant="outline" onClick={() => incidentMutation.mutate({ id: detailIncident.id, action: "acknowledge" })}>사건 접수</Button>
                    )}
                    {detailIncident.status === "recovery_detected" && canEdit && (
                      <div className="space-y-2">
                        <Label>복구 확인 내용</Label>
                        <Input value={recoveryNote} onChange={(event) => setRecoveryNote(event.target.value)} placeholder="현장 확인 및 정상 통신 확인" />
                        <Button className="w-full" disabled={recoveryNote.trim().length < 3 || incidentMutation.isPending} onClick={() => incidentMutation.mutate({ id: detailIncident.id, action: "confirm_recovery", note: recoveryNote })}>복구 확인 및 종결</Button>
                      </div>
                    )}
                    <Button className="w-full" variant="ghost" onClick={() => navigate("/facility/maintenance")}><Wrench className="h-4 w-4 mr-1" />작업지시 보기</Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
