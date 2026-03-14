import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server, Wifi, WifiOff, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { GW_STATUS_LABELS } from "@/types/realtime";

export default function RealtimeGateways() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);
  const [showRegister, setShowRegister] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
      return data || [];
    },
  });

  const { data: gateways, isLoading } = useQuery({
    queryKey: ["gateways-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gateway_devices")
        .select("*, parking_lots(code, name)")
        .order("status").order("last_heartbeat", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const totalCount = (gateways || []).length;
  const onlineCount = (gateways || []).filter(g => {
    if (g.status !== 'active') return false;
    if (!g.last_heartbeat) return false;
    return new Date(g.last_heartbeat) > new Date(Date.now() - 5 * 60 * 1000);
  }).length;
  const offlineCount = totalCount - onlineCount;

  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const minutesAgo = (ts?: string | null) => {
    if (!ts) return "—";
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (diff < 1) return "방금";
    if (diff < 60) return `${diff}분 전`;
    return `${Math.round(diff / 60)}시간 전`;
  };

  const handleRegister = async () => {
    if (!form.lot_id || !form.device_id) {
      toast({ title: "필수 항목을 입력하세요", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("gateway_devices").insert({
      lot_id: form.lot_id,
      device_id: form.device_id,
      device_name: form.device_name || null,
      ip_address: form.ip_address || null,
      mac_address: form.mac_address || null,
      protocol: form.protocol || 'mqtt',
      mqtt_topic: form.mqtt_topic || null,
      location_detail: form.location_detail || null,
      floor: form.floor ? Number(form.floor) : null,
      max_sensors: form.max_sensors ? Number(form.max_sensors) : 200,
      alert_offline_minutes: form.alert_offline_minutes ? Number(form.alert_offline_minutes) : 10,
    });
    if (error) {
      toast({ title: "등록 실패", description: error.message, variant: "destructive" });
    } else {
      await logActivity({ module: "realtime", action: "create", targetType: "gateway", targetName: form.device_id });
      toast({ title: "게이트웨이가 등록되었습니다" });
      setShowRegister(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ["gateways-all"] });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">게이트웨이 관리</h2>
            <p className="text-sm text-muted-foreground">센서 데이터 수집 게이트웨이 장치</p>
          </div>
          {canEdit && <Button onClick={() => setShowRegister(true)}><Plus className="h-4 w-4 mr-1" />게이트웨이 등록</Button>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <KpiCard title="전체 게이트웨이" value={totalCount} icon={Server} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <KpiCard title="온라인" value={onlineCount} icon={Wifi} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
          <KpiCard title="오프라인" value={offlineCount} icon={WifiOff} iconColor="text-red-600" iconBg="bg-red-50" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : (gateways || []).length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">등록된 게이트웨이가 없습니다</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(gateways || []).map(gw => {
              const isOnline = gw.status === 'active' && gw.last_heartbeat &&
                new Date(gw.last_heartbeat) > new Date(Date.now() - 5 * 60 * 1000);
              const sensorPct = gw.max_sensors > 0 ? Math.round(gw.connected_sensors / gw.max_sensors * 100) : 0;

              return (
                <Card key={gw.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowDetail(gw)}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{gw.device_name || gw.device_id}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{gw.device_id}</p>
                      </div>
                      <div className={`h-4 w-4 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    </div>
                    <p className="text-xs text-muted-foreground">{(gw.parking_lots as any)?.name || '—'}</p>
                    {gw.ip_address && <p className="text-xs font-mono">{gw.ip_address}</p>}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>연결 센서</span>
                        <span>{gw.connected_sensors} / {gw.max_sensors}</span>
                      </div>
                      <Progress value={sensorPct} className="h-1.5" />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>마지막 통신: {minutesAgo(gw.last_heartbeat)}</span>
                      <span>FW: {gw.firmware_version || '—'}</span>
                    </div>
                    {gw.uptime_hours != null && (
                      <p className="text-[10px] text-muted-foreground">가동시간: {Number(gw.uptime_hours).toLocaleString()}시간</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Register Dialog */}
        <Dialog open={showRegister} onOpenChange={setShowRegister}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>게이트웨이 등록</DialogTitle></DialogHeader>
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
                <Input value={form.device_id || ''} onChange={e => updateForm('device_id', e.target.value)} />
              </div>
              <div>
                <Label>장치명</Label>
                <Input value={form.device_name || ''} onChange={e => updateForm('device_name', e.target.value)} />
              </div>
              <div>
                <Label>IP 주소</Label>
                <Input value={form.ip_address || ''} onChange={e => updateForm('ip_address', e.target.value)} />
              </div>
              <div>
                <Label>MAC 주소</Label>
                <Input value={form.mac_address || ''} onChange={e => updateForm('mac_address', e.target.value)} />
              </div>
              <div>
                <Label>프로토콜</Label>
                <Select value={form.protocol || 'mqtt'} onValueChange={v => updateForm('protocol', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mqtt">MQTT</SelectItem>
                    <SelectItem value="coap">CoAP</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>MQTT 토픽</Label>
                <Input value={form.mqtt_topic || ''} onChange={e => updateForm('mqtt_topic', e.target.value)} />
              </div>
              <div>
                <Label>최대 센서 수</Label>
                <Input type="number" value={form.max_sensors || 200} onChange={e => updateForm('max_sensors', e.target.value)} />
              </div>
              <div>
                <Label>오프라인 알림 (분)</Label>
                <Input type="number" value={form.alert_offline_minutes || 10} onChange={e => updateForm('alert_offline_minutes', e.target.value)} />
              </div>
              <div>
                <Label>층</Label>
                <Input type="number" value={form.floor || ''} onChange={e => updateForm('floor', e.target.value)} />
              </div>
              <div>
                <Label>상세 위치</Label>
                <Input value={form.location_detail || ''} onChange={e => updateForm('location_detail', e.target.value)} />
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
            <DialogHeader><DialogTitle>게이트웨이 상세 — {showDetail?.device_name || showDetail?.device_id}</DialogTitle></DialogHeader>
            {showDetail && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">장치 ID:</span> {showDetail.device_id}</div>
                  <div><span className="text-muted-foreground">프로토콜:</span> {showDetail.protocol}</div>
                  <div><span className="text-muted-foreground">IP:</span> {showDetail.ip_address || '—'}</div>
                  <div><span className="text-muted-foreground">MAC:</span> {showDetail.mac_address || '—'}</div>
                  <div><span className="text-muted-foreground">주차장:</span> {(showDetail.parking_lots as any)?.name}</div>
                  <div><span className="text-muted-foreground">펌웨어:</span> {showDetail.firmware_version || '—'}</div>
                  <div><span className="text-muted-foreground">센서:</span> {showDetail.connected_sensors}/{showDetail.max_sensors}</div>
                  <div><span className="text-muted-foreground">재시작:</span> {showDetail.restart_count || 0}회</div>
                  <div><span className="text-muted-foreground">마지막 통신:</span> {minutesAgo(showDetail.last_heartbeat)}</div>
                  <div><span className="text-muted-foreground">가동시간:</span> {showDetail.uptime_hours ? `${Number(showDetail.uptime_hours).toLocaleString()}h` : '—'}</div>
                </div>
                <Badge variant="outline">{GW_STATUS_LABELS[showDetail.status] || showDetail.status}</Badge>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
