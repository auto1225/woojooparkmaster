import { useMemo, useState } from "react";
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
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { archiveRealtimeDevice, createRealtimeGateway, updateRealtimeDevice } from "@/lib/workflow-commands";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";
import { isGatewayOnline } from "@/lib/realtime-health";

export default function RealtimeGateways() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);
  const [showRegister, setShowRegister] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("health");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [manageForm, setManageForm] = useState<Record<string, any>>({});
  const [archiveReason, setArchiveReason] = useState("");

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
      return data || [];
    },
  });

  const { data: gateways, isLoading } = useQuery({
    queryKey: ["gateways-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gateway_devices")
        .select("*, parking_lots(code, name, lot_type)")
        .is("archived_at", null)
        .order("status").order("last_heartbeat", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const totalCount = (gateways || []).length;
  const onlineCount = (gateways || []).filter((gateway) => isGatewayOnline(gateway)).length;
  const offlineCount = totalCount - onlineCount;
  const filteredGateways = useMemo(() => {
    const health = (gateway: any) => isGatewayOnline(gateway) ? 1 : 0;
    const rows = (gateways || []).filter((gateway) => {
      const lot = gateway.parking_lots as any;
      if (lotFilter !== "all" && gateway.lot_id !== lotFilter) return false;
      if (lotTypeFilter !== "all" && lot?.lot_type !== lotTypeFilter) return false;
      if (statusFilter === "online" && !health(gateway)) return false;
      if (statusFilter === "offline" && health(gateway)) return false;
      if (!["all", "online", "offline"].includes(statusFilter) && gateway.status !== statusFilter) return false;
      const needle = search.trim().toLocaleLowerCase("ko");
      return !needle || [gateway.device_id, gateway.device_name, gateway.ip_address, gateway.mac_address, gateway.location_detail, lot?.name, lot?.code]
        .some((value) => String(value || "").toLocaleLowerCase("ko").includes(needle));
    });
    const value = (gateway: any) => sortKey === "device" ? gateway.device_id : sortKey === "lot" ? gateway.parking_lots?.name : sortKey === "heartbeat" ? gateway.last_heartbeat : sortKey === "capacity" ? Number(gateway.connected_sensors || 0) / Number(gateway.max_sensors || 1) : health(gateway);
    return [...rows].sort((a, b) => {
      const av = value(a); const bv = value(b);
      const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "ko");
      return sortDirection === "asc" ? result : -result;
    });
  }, [gateways, lotFilter, lotTypeFilter, search, sortDirection, sortKey, statusFilter]);

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
    try {
      await createRealtimeGateway(form, crypto.randomUUID());
      await logActivity({ module: "realtime", action: "create", targetType: "gateway", targetName: form.device_id });
      toast({ title: "게이트웨이가 등록되었습니다" });
      setShowRegister(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ["gateways-all"] });
    } catch (error) {
      toast({ title: "등록 실패", description: error instanceof Error ? error.message : "등록하지 못했습니다.", variant: "destructive" });
    }
  };

  const openDetail = (gateway: any) => {
    setShowDetail(gateway);
    setArchiveReason("");
    setManageForm({ device_name: gateway.device_name || "", ip_address: gateway.ip_address || "", location_detail: gateway.location_detail || "", status: gateway.status });
  };

  const saveDevice = async () => {
    if (!showDetail) return;
    try {
      await updateRealtimeDevice("gateway", showDetail.id, manageForm, showDetail.row_version);
      toast({ title: "게이트웨이 정보를 수정했습니다" });
      setShowDetail(null);
      queryClient.invalidateQueries({ queryKey: ["gateways-all"] });
    } catch (error) {
      toast({ title: "수정 실패", description: error instanceof Error ? error.message : "수정하지 못했습니다.", variant: "destructive" });
    }
  };

  const archiveDevice = async () => {
    if (!showDetail) return;
    try {
      await archiveRealtimeDevice("gateway", showDetail.id, archiveReason, showDetail.row_version);
      toast({ title: "게이트웨이를 보관했습니다" });
      setShowDetail(null);
      queryClient.invalidateQueries({ queryKey: ["gateways-all"] });
    } catch (error) {
      toast({ title: "보관 실패", description: error instanceof Error ? error.message : "보관하지 못했습니다.", variant: "destructive" });
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
          <KpiCard label="전체 게이트웨이" value={String(totalCount)} icon={Server} />
          <KpiCard label="온라인" value={String(onlineCount)} icon={Wifi} />
          <KpiCard label="오프라인" value={String(offlineCount)} icon={WifiOff} />
        </div>

        <OperationalListControls
          search={search} onSearchChange={setSearch} searchPlaceholder="장치ID, IP, MAC, 위치 검색"
          lots={(lots || []).map((lot) => ({ value: lot.id, label: `${lot.name} · ${getParkingLotTypeLabel(lot.lot_type)}` }))}
          lotId={lotFilter} onLotChange={setLotFilter}
          categories={[{ value: "offstreet", label: "노외주차장" }, { value: "multilevel", label: "주차빌딩" }, { value: "onstreet", label: "노상주차장" }]}
          category={lotTypeFilter} onCategoryChange={setLotTypeFilter} categoryLabel="전체 주차장 유형"
          statuses={[{ value: "online", label: "온라인" }, { value: "offline", label: "오프라인" }, ...Object.entries(GW_STATUS_LABELS).filter(([value]) => !["active", "offline"].includes(value)).map(([value, label]) => ({ value, label }))]}
          status={statusFilter} onStatusChange={setStatusFilter}
          sortOptions={[{ value: "health", label: "연결 상태순" }, { value: "heartbeat", label: "마지막 통신순" }, { value: "capacity", label: "센서 사용률순" }, { value: "lot", label: "주차장순" }, { value: "device", label: "장치ID순" }]}
          sortKey={sortKey} onSortKeyChange={setSortKey} sortDirection={sortDirection} onSortDirectionChange={setSortDirection}
          resultCount={filteredGateways.length} totalCount={(gateways || []).length}
          onReset={() => { setSearch(""); setLotFilter("all"); setLotTypeFilter("all"); setStatusFilter("all"); setSortKey("health"); setSortDirection("asc"); }}
        />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : filteredGateways.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">등록된 게이트웨이가 없습니다</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredGateways.map(gw => {
              const isOnline = isGatewayOnline(gw);
              const sensorPct = gw.max_sensors > 0 ? Math.round(gw.connected_sensors / gw.max_sensors * 100) : 0;

              return (
                <Card key={gw.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(gw)}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{gw.device_name || gw.device_id}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{gw.device_id}</p>
                      </div>
                      <div className={`h-4 w-4 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    </div>
                    <p className="text-xs text-muted-foreground">{(gw.parking_lots as any)?.name || '—'} · {getParkingLotTypeLabel((gw.parking_lots as any)?.lot_type || gw.lot_type_snapshot)}</p>
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
                {canEdit && <div className="space-y-3 border-t pt-3">
                  <div><Label>장치명</Label><Input value={manageForm.device_name || ""} onChange={(event) => setManageForm((value) => ({ ...value, device_name: event.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-2"><div><Label>IP 주소</Label><Input value={manageForm.ip_address || ""} onChange={(event) => setManageForm((value) => ({ ...value, ip_address: event.target.value }))} /></div><div><Label>상태</Label><Select value={manageForm.status || "active"} onValueChange={(status) => setManageForm((value) => ({ ...value, status }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">가동중</SelectItem><SelectItem value="maintenance">점검중</SelectItem><SelectItem value="offline">오프라인</SelectItem></SelectContent></Select></div></div>
                  <div><Label>상세 위치</Label><Input value={manageForm.location_detail || ""} onChange={(event) => setManageForm((value) => ({ ...value, location_detail: event.target.value }))} /></div>
                  <Button className="w-full" onClick={saveDevice}>수정 저장</Button>
                  <div className="flex gap-2"><Input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="보관 사유 3자 이상" /><Button variant="destructive" disabled={archiveReason.trim().length < 3} onClick={archiveDevice}>보관</Button></div>
                </div>}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
