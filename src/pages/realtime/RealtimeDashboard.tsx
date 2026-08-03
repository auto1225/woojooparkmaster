import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Car, ChevronDown, ChevronUp, CircleCheck, Clock3, Monitor, ParkingCircle, Search, Wifi, WifiOff, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KpiCard } from "@/components/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CONGESTION_BG, CONGESTION_COLORS, CONGESTION_LABELS } from "@/types/realtime";
import { isRealtimeLotFresh, REALTIME_LOT_STALE_MINUTES } from "@/lib/realtime-health";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";

type CongestionLevel = "empty" | "normal" | "crowded" | "full";
const CONGESTION_ORDER: Record<string, number> = { full: 0, crowded: 1, normal: 2, empty: 3 };

function elapsed(timestamp?: string | null) {
  if (!timestamp) return "갱신 기록 없음";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.round(minutes / 60)}시간 전`;
}

export default function RealtimeDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [logOpen, setLogOpen] = useState(false);
  const [subscriptionConnected, setSubscriptionConnected] = useState(false);
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

  useEffect(() => {
    const channel = supabase.channel("realtime-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "lot_realtime_status" }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["realtime-status-all"] });
        const next = payload.new;
        if (!next) return;
        setPulsingLots((previous) => new Set(previous).add(next.lot_id));
        window.setTimeout(() => setPulsingLots((previous) => {
          const copy = new Set(previous);
          copy.delete(next.lot_id);
          return copy;
        }), 2000);
        const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const level = CONGESTION_LABELS[next.congestion_level] || next.congestion_level;
        setStatusLogs((previous) => [`[${time}] 상태 변경: ${level} (잔여 ${next.available_spaces ?? "-"}면)`, ...previous].slice(0, 20));
      })
      .subscribe((status) => setSubscriptionConnected(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [statusLogs]);

  const freshLots = useMemo(() => (lots || []).filter((lot) => isRealtimeLotFresh(lot.last_updated)), [lots]);
  const staleCount = (lots || []).length - freshLots.length;
  const filtered = useMemo(() => (lots || [])
    .filter((lot) => {
      const fresh = isRealtimeLotFresh(lot.last_updated);
      if (freshnessFilter === "fresh" && !fresh) return false;
      if (freshnessFilter === "stale" && fresh) return false;
      if (filter !== "all" && (!fresh || lot.congestion_level !== filter)) return false;
      const parkingLot = lot.parking_lots as any;
      const needle = search.trim().toLocaleLowerCase("ko");
      return !needle || [parkingLot?.name, parkingLot?.code].some((value) => String(value || "").toLocaleLowerCase("ko").includes(needle));
    })
    .sort((a, b) => {
      const freshDifference = Number(isRealtimeLotFresh(a.last_updated)) - Number(isRealtimeLotFresh(b.last_updated));
      return freshDifference || (CONGESTION_ORDER[a.congestion_level] ?? 9) - (CONGESTION_ORDER[b.congestion_level] ?? 9);
    }), [filter, freshnessFilter, lots, search]);

  const totalSpaces = freshLots.reduce((sum, lot) => sum + (lot.total_spaces || 0), 0);
  const totalOccupied = freshLots.reduce((sum, lot) => sum + (lot.occupied_spaces || 0), 0);
  const totalAvailable = freshLots.reduce((sum, lot) => sum + (lot.available_spaces || 0), 0);
  const fullCount = freshLots.filter((lot) => lot.congestion_level === "full").length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">실시간 주차 현황</h2>
            <p className="text-sm text-muted-foreground">수집 시각을 검증한 주차장 점유 현황</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/realtime/monitor")}>
              <Monitor className="mr-1 h-3.5 w-3.5" /> 관제 모니터
            </Button>
            <Badge variant="outline" className={subscriptionConnected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}>
              {subscriptionConnected ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
              {subscriptionConnected ? "구독 연결" : "구독 끊김"}
            </Badge>
          </div>
        </div>

        {staleCount > 0 && (
          <div className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div><strong>{staleCount}개소 데이터 지연</strong><p>{REALTIME_LOT_STALE_MINUTES}분 이상 갱신되지 않은 값은 현재 점유 통계에서 제외했습니다.</p></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="유효 주차면" value={totalSpaces.toLocaleString()} icon={Car} />
          <KpiCard label="현재 점유" value={totalOccupied.toLocaleString()} icon={ParkingCircle} />
          <KpiCard label="잔여 면수" value={totalAvailable.toLocaleString()} icon={CircleCheck} />
          <KpiCard label="만차 주차장" value={`${fullCount}개소`} icon={XCircle} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="주차장명 또는 코드 검색" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
          </div>
          {[{ value: "all", label: "전체" }, { value: "fresh", label: "정상 갱신" }, { value: "stale", label: "데이터 지연" }].map((option) => (
            <Button key={option.value} size="sm" variant={freshnessFilter === option.value ? "default" : "outline"} onClick={() => setFreshnessFilter(option.value)}>{option.label}</Button>
          ))}
          {["all", "empty", "normal", "crowded", "full"].map((value) => (
            <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>
              {value === "all" ? "혼잡도 전체" : CONGESTION_LABELS[value]}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-44" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">조건에 맞는 주차장이 없습니다.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((lot) => {
              const parkingLot = lot.parking_lots as any;
              const fresh = isRealtimeLotFresh(lot.last_updated);
              const congestion = lot.congestion_level as CongestionLevel;
              const rate = Number(lot.occupancy_rate || 0);
              return (
                <Card key={lot.lot_id} className={`transition-all ${pulsingLots.has(lot.lot_id) ? "ring-2 ring-primary ring-offset-1" : ""} ${!fresh ? "border-amber-300" : ""}`}>
                  <CardContent className="space-y-3 pb-4 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-semibold">{parkingLot?.name || "미지정"}</p><p className="text-xs text-muted-foreground">{parkingLot?.code} · {getParkingLotTypeLabel(parkingLot?.lot_type)}</p></div>
                      <Badge className={fresh ? CONGESTION_COLORS[congestion] || "" : "bg-amber-100 text-amber-900"}>{fresh ? CONGESTION_LABELS[congestion] || congestion : "데이터 지연"}</Badge>
                    </div>
                    {fresh ? (
                      <>
                        <div className="text-center"><span className="text-3xl font-bold">{(lot.available_spaces ?? 0).toLocaleString()}</span><span className="ml-1 text-sm text-muted-foreground">면</span><span className="ml-2 text-xs text-muted-foreground">/ 총 {(lot.total_spaces || 0).toLocaleString()}</span></div>
                        <div className="space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>점유율</span><span>{rate.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${CONGESTION_BG[congestion] || "bg-blue-500"}`} style={{ width: `${Math.min(rate, 100)}%` }} /></div></div>
                        <div className="flex justify-between text-xs text-muted-foreground"><span>오늘 입차 {(lot.today_total_in || 0).toLocaleString()}</span><span>최고 {lot.today_peak_occupied || 0}면</span></div>
                      </>
                    ) : (
                      <div className="flex min-h-20 flex-col items-center justify-center text-center text-sm text-muted-foreground"><Clock3 className="mb-1 h-5 w-5" /><strong className="text-foreground">현재 수치 표시 중지</strong><span>마지막 갱신 {elapsed(lot.last_updated)}</span></div>
                    )}
                    <p className="text-right text-xs text-muted-foreground">갱신: {elapsed(lot.last_updated)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card>
          <CardHeader className="cursor-pointer pb-2" onClick={() => setLogOpen((open) => !open)}><div className="flex items-center justify-between"><CardTitle className="text-sm">상태 변경 로그</CardTitle>{logOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div></CardHeader>
          {logOpen && <CardContent><div ref={logRef} className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs">{statusLogs.length ? statusLogs.map((log, index) => <p key={`${log}-${index}`} className="text-muted-foreground">{log}</p>) : <p className="py-4 text-center text-muted-foreground">새 상태 변경이 여기에 표시됩니다.</p>}</div></CardContent>}
        </Card>
      </div>
    </DashboardLayout>
  );
}
