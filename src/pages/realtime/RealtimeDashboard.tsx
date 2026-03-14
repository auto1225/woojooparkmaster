import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiCard } from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, ParkingCircle, CircleCheck, XCircle, Search, ChevronDown, ChevronUp, Wifi, WifiOff } from "lucide-react";
import { CONGESTION_LABELS, CONGESTION_COLORS, CONGESTION_BG } from "@/types/realtime";

type CongestionLevel = 'empty' | 'normal' | 'crowded' | 'full';

const CONGESTION_ORDER: Record<string, number> = { full: 0, crowded: 1, normal: 2, empty: 3 };

export default function RealtimeDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [logOpen, setLogOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  const [pulsingLots, setPulsingLots] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);

  const { data: lots, isLoading } = useQuery({
    queryKey: ["realtime-status-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_realtime_status")
        .select("*, parking_lots(code, name, latitude, longitude, lot_type)");
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('realtime-status')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'lot_realtime_status',
      }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["realtime-status-all"] });
        const newData = payload.new;
        if (newData) {
          const lotId = newData.lot_id;
          setPulsingLots(prev => new Set(prev).add(lotId));
          setTimeout(() => setPulsingLots(prev => {
            const s = new Set(prev);
            s.delete(lotId);
            return s;
          }), 2000);
          const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const level = CONGESTION_LABELS[newData.congestion_level] || newData.congestion_level;
          setStatusLogs(prev => [`[${now}] 주차장 상태 변경 → ${level} (잔여 ${newData.available_spaces ?? '?'}대)`, ...prev].slice(0, 20));
        }
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [statusLogs]);

  const filtered = (lots || [])
    .filter(l => {
      if (filter !== 'all' && l.congestion_level !== filter) return false;
      if (search) {
        const name = (l.parking_lots as any)?.name || '';
        const code = (l.parking_lots as any)?.code || '';
        return name.includes(search) || code.includes(search);
      }
      return true;
    })
    .sort((a, b) => (CONGESTION_ORDER[a.congestion_level] ?? 9) - (CONGESTION_ORDER[b.congestion_level] ?? 9));

  const totalSpaces = (lots || []).reduce((s, l) => s + (l.total_spaces || 0), 0);
  const totalOccupied = (lots || []).reduce((s, l) => s + (l.occupied_spaces || 0), 0);
  const totalAvailable = (lots || []).reduce((s, l) => s + (l.available_spaces || 0), 0);
  const fullCount = (lots || []).filter(l => l.congestion_level === 'full').length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">실시간 주차 현황</h2>
            <p className="text-sm text-muted-foreground">전체 주차장 실시간 점유 모니터링</p>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> 실시간 연결됨
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> 연결 끊김
              </Badge>
            )}
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="전체 주차면" value={totalSpaces.toLocaleString()} icon={Car} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <KpiCard title="현재 점유" value={totalOccupied.toLocaleString()} icon={ParkingCircle} iconColor="text-orange-600" iconBg="bg-orange-50" />
          <KpiCard title="잔여 면수" value={totalAvailable.toLocaleString()} icon={CircleCheck} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
          <KpiCard title="만차 주차장" value={`${fullCount}개소`} icon={XCircle} iconColor="text-red-600" iconBg="bg-red-50" />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="주차장명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          {['all', 'empty', 'normal', 'crowded', 'full'].map(f => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}>
              {f === 'all' ? '전체' : CONGESTION_LABELS[f]}
            </Button>
          ))}
        </div>

        {/* Lot Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">표시할 주차장이 없습니다</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(lot => {
              const pl = lot.parking_lots as any;
              const congestion = lot.congestion_level as CongestionLevel;
              const rate = Number(lot.occupancy_rate || 0);
              const isFull = congestion === 'full';
              const isPulsing = pulsingLots.has(lot.lot_id);

              return (
                <Card key={lot.lot_id}
                  className={`transition-all ${isFull ? 'border-red-400 shadow-red-100 shadow-md animate-pulse' : ''} ${isPulsing ? 'ring-2 ring-primary ring-offset-1' : ''}`}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{pl?.name || '—'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{pl?.code}</p>
                      </div>
                      <Badge className={`text-xs ${CONGESTION_COLORS[congestion] || ''}`}>
                        {CONGESTION_LABELS[congestion] || congestion}
                      </Badge>
                    </div>
                    <div className="text-center">
                      <span className="text-3xl font-bold">{(lot.available_spaces ?? 0).toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground ml-1">대</span>
                      <span className="text-xs text-muted-foreground ml-2">/ 총 {(lot.total_spaces || 0).toLocaleString()}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>점유율</span>
                        <span>{rate.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${CONGESTION_BG[congestion] || 'bg-blue-500'}`}
                          style={{ width: `${Math.min(rate, 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>금일 입차: {(lot.today_total_in || 0).toLocaleString()}</span>
                      <span>피크: {lot.today_peak_occupied || 0}대 {lot.today_peak_time ? `(${lot.today_peak_time})` : ''}</span>
                    </div>
                    {lot.last_updated && (
                      <p className="text-[10px] text-muted-foreground text-right">
                        갱신: {new Date(lot.last_updated).toLocaleTimeString('ko-KR')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Status Log Panel */}
        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setLogOpen(!logOpen)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">상태 변경 로그</CardTitle>
              {logOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {logOpen && (
            <CardContent>
              <div ref={logRef} className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
                {statusLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">실시간 상태 변경 로그가 여기에 표시됩니다</p>
                ) : statusLogs.map((log, i) => (
                  <p key={i} className="text-muted-foreground">{log}</p>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Sensor vs Gate Integrity */}
        {(lots || []).some(l => (l.sensor_vs_gate_diff ?? 0) !== 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">센서 vs 게이트 카운터 비교</CardTitle>
              <p className="text-[10px] text-muted-foreground">차이는 센서 오보정, 게이트 인식 실패, 또는 출입구 개방 등으로 발생합니다</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(lots || []).filter(l => (l.sensor_vs_gate_diff ?? 0) !== 0).map(l => {
                  const diff = l.sensor_vs_gate_diff ?? 0;
                  const absDiff = Math.abs(diff);
                  const color = absDiff >= 10 ? 'text-red-600' : absDiff >= 5 ? 'text-orange-600' : 'text-muted-foreground';
                  return (
                    <div key={l.lot_id} className="flex items-center justify-between text-sm">
                      <span>{(l.parking_lots as any)?.name}</span>
                      <div className="flex gap-4 text-xs">
                        <span>센서: {l.occupied_spaces}</span>
                        <span>게이트: {l.gate_calculated_occupied ?? 0}</span>
                        <span className={`font-bold ${color}`}>차이: {diff > 0 ? '+' : ''}{diff}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
