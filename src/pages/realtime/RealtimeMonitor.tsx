import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Monitor, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { CONGESTION_LABELS, CONGESTION_BG } from "@/types/realtime";

type EventLog = { time: string; lot: string; level: string; available: number };

export default function RealtimeMonitor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [now, setNow] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => {
      const savedTheme = localStorage.getItem('parkmaster-theme');
      if (savedTheme !== 'dark') document.documentElement.classList.remove('dark');
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'Escape') { exitFullscreen(); navigate('/realtime'); }
      if (e.key === 's' || e.key === 'S') {} // auto-cycle toggle
      if (e.key === 'm' || e.key === 'M') setMuted(v => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    setIsFullscreen(false);
  };

  const { data: lots } = useQuery({
    queryKey: ["monitor-lots"],
    queryFn: async () => {
      const { data } = await supabase
        .from("lot_realtime_status")
        .select("*, parking_lots(code, name, latitude, longitude)");
      return data || [];
    },
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('monitor-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_realtime_status' }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["monitor-lots"] });
        const n = payload.new;
        if (n) {
          const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setEventLogs(prev => [{
            time: t,
            lot: '주차장',
            level: CONGESTION_LABELS[n.congestion_level] || n.congestion_level,
            available: n.available_spaces ?? 0,
          }, ...prev].slice(0, 50));
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const sorted = [...(lots || [])].sort((a, b) => {
    const order: Record<string, number> = { full: 0, crowded: 1, normal: 2, empty: 3 };
    return (order[a.congestion_level] ?? 9) - (order[b.congestion_level] ?? 9);
  });

  const totalSpaces = sorted.reduce((s, l) => s + (l.total_spaces || 0), 0);
  const totalOccupied = sorted.reduce((s, l) => s + (l.occupied_spaces || 0), 0);
  const totalAvailable = sorted.reduce((s, l) => s + (l.available_spaces || 0), 0);
  const fullCount = sorted.filter(l => l.congestion_level === 'full').length;
  const occupancyRate = totalSpaces > 0 ? Math.round((totalOccupied / totalSpaces) * 100) : 0;
  const todayIn = sorted.reduce((s, l) => s + (l.today_total_in || 0), 0);
  const todayOut = sorted.reduce((s, l) => s + (l.today_total_out || 0), 0);
  const allFull = sorted.length > 0 && sorted.every(l => l.congestion_level === 'full');

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${dayNames[now.getDay()]})`;
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const rateColor = occupancyRate >= 90 ? 'text-red-400' : occupancyRate >= 70 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div ref={containerRef} className={`min-h-screen bg-[#0A0F1A] text-white font-sans ${allFull ? 'ring-4 ring-red-500 ring-inset animate-pulse' : ''}`}>
      {/* Alert banners */}
      {allFull && (
        <div className="bg-red-600 text-white text-center py-2 text-sm font-bold animate-pulse">
          ⚠️ 전체 만차
        </div>
      )}

      {/* Top bar */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Monitor className="h-5 w-5 text-blue-400" />
          <span className="font-bold text-sm">ParkMaster</span>
        </div>
        <div className="text-3xl font-mono font-bold tracking-wider text-blue-300">{timeStr}</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{dateStr}</span>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setMuted(v => !v)}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={() => navigate('/realtime')}>일반 화면</Button>
        </div>
      </div>

      {/* Main content - 3 columns */}
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left - KPI Panel */}
        <div className="w-[20%] border-r border-white/10 p-4 space-y-4 flex flex-col">
          <KpiBlock label="총 주차면" value={totalSpaces} unit="대" color="text-white" />
          <KpiBlock label="현재 점유" value={totalOccupied} unit="대" color="text-amber-400" />
          <KpiBlock label="잔여" value={totalAvailable} unit="대" color="text-emerald-400" large glow />
          <div className="text-center py-4">
            <div className={`text-5xl font-bold ${rateColor}`}>{occupancyRate}%</div>
            <div className="text-xs text-gray-500 mt-1">이용률</div>
            <div className="mt-2 h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${occupancyRate >= 90 ? 'bg-red-500' : occupancyRate >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${occupancyRate}%` }} />
            </div>
          </div>
          {fullCount > 0 && (
            <div className="text-center animate-pulse">
              <span className="text-red-400 text-2xl font-bold">{fullCount}</span>
              <span className="text-red-400 text-sm ml-1">개소 만차</span>
            </div>
          )}
          <KpiBlock label="금일 입차" value={todayIn} unit="대" color="text-blue-300" />
          <KpiBlock label="금일 출차" value={todayOut} unit="대" color="text-purple-300" />
        </div>

        {/* Center - Map placeholder */}
        <div className="w-[55%] p-4 flex items-center justify-center">
          <div className="w-full h-full rounded-xl bg-gray-900/50 border border-white/5 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Monitor className="h-16 w-16 text-blue-400/30 mx-auto" />
              <p className="text-gray-500 text-sm">지도 연동 영역</p>
              <p className="text-gray-600 text-xs">시스템 설정에서 지도 API 키를 등록하세요</p>
              {/* Lot grid summary */}
              <div className="grid grid-cols-3 gap-2 max-w-md mx-auto mt-6">
                {sorted.slice(0, 12).map(lot => {
                  const pl = lot.parking_lots as any;
                  const isFull = lot.congestion_level === 'full';
                  return (
                    <div key={lot.lot_id} className={`rounded-lg p-2 text-center ${isFull ? 'bg-red-900/50 border border-red-500 animate-pulse' : 'bg-gray-800/50 border border-white/5'}`}>
                      <div className="text-[10px] text-gray-400 truncate">{pl?.name || '—'}</div>
                      <div className={`text-lg font-bold ${isFull ? 'text-red-400' : 'text-emerald-400'}`}>{lot.available_spaces ?? 0}</div>
                      <div className="text-[9px] text-gray-500">/ {lot.total_spaces || 0}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right - Lists */}
        <div className="w-[25%] border-l border-white/10 flex flex-col">
          {/* Top half - Lot status list */}
          <div className="flex-1 border-b border-white/10 overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5">
              <span className="text-xs font-medium text-gray-400">주차장 현황</span>
            </div>
            <div className="overflow-y-auto h-[calc(100%-2rem)]">
              {sorted.map(lot => {
                const pl = lot.parking_lots as any;
                const rate = lot.total_spaces ? (lot.occupied_spaces || 0) / lot.total_spaces * 100 : 0;
                const isFull = lot.congestion_level === 'full';
                const barColor = isFull ? 'bg-red-500' : rate >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={lot.lot_id} className={`flex items-center gap-2 px-3 py-1.5 border-b border-white/5 ${isFull ? 'bg-red-950/30 animate-pulse' : ''}`}>
                    <div className={`w-1 h-6 rounded-full ${barColor}`} />
                    <span className="text-xs flex-1 truncate">{pl?.name || '—'}</span>
                    <span className={`text-xs font-mono ${isFull ? 'text-red-400' : 'text-gray-300'}`}>
                      {lot.available_spaces ?? 0}/{lot.total_spaces || 0}
                    </span>
                    <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(rate, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom half - Event feed */}
          <div className="flex-1 overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5">
              <span className="text-xs font-medium text-gray-400">이벤트 피드</span>
            </div>
            <div className="overflow-y-auto h-[calc(100%-2rem)] font-mono text-[11px]">
              {eventLogs.length === 0 ? (
                <div className="text-center text-gray-600 py-8">실시간 이벤트 대기 중...</div>
              ) : (
                eventLogs.map((log, i) => (
                  <div key={i} className={`px-3 py-1 border-b border-white/5 ${log.level === '만차' ? 'text-red-400' : log.level === '여유' ? 'text-emerald-400' : 'text-gray-400'}`}>
                    [{log.time}] {log.lot}: {log.level} (잔여 {log.available}대)
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiBlock({ label, value, unit, color, large, glow }: { label: string; value: number; unit: string; color: string; large?: boolean; glow?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
      <div className={`${large ? 'text-4xl' : 'text-2xl'} font-bold ${color} ${glow ? 'drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]' : ''}`}>
        {value.toLocaleString()}
        <span className="text-sm font-normal ml-0.5">{unit}</span>
      </div>
    </div>
  );
}
