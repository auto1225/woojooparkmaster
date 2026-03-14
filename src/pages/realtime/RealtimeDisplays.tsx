import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Plus, Send, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { DISPLAY_LOCATION_LABELS, DISPLAY_PROTOCOL_LABELS } from "@/types/realtime";

export default function RealtimeDisplays() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").eq("status", "active").order("code");
      return data || [];
    },
  });

  const { data: boards, isLoading } = useQuery({
    queryKey: ["display-boards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("display_boards")
        .select("*, parking_lots(code, name)")
        .order("lot_id").order("board_id");
      if (error) throw error;
      return data || [];
    },
  });

  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleRegister = async () => {
    if (!form.lot_id || !form.board_id) {
      toast({ title: "필수 항목을 입력하세요", variant: "destructive" });
      return;
    }
    const template = {
      format: form.template_format || '잔여 {available}대',
      full_message: form.template_full || '만 차',
    };
    const { error } = await supabase.from("display_boards").insert({
      lot_id: form.lot_id,
      board_id: form.board_id,
      board_name: form.board_name || null,
      location: form.location || null,
      location_type: form.location_type || null,
      direction: form.direction || null,
      floor: form.floor ? Number(form.floor) : null,
      protocol: form.protocol || null,
      ip_address: form.ip_address || null,
      port: form.port ? Number(form.port) : null,
      display_type: form.display_type || null,
      display_template: template,
      push_interval_sec: form.push_interval_sec ? Number(form.push_interval_sec) : 10,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      install_date: form.install_date || null,
    });
    if (error) {
      toast({ title: "등록 실패", description: error.message, variant: "destructive" });
    } else {
      await logActivity({ module: "realtime", action: "create", targetType: "display_board", targetName: form.board_id });
      toast({ title: "전광판이 등록되었습니다" });
      setShowRegister(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ["display-boards"] });
    }
  };

  const handleManualPush = async (board: any) => {
    // Get realtime status for the lot
    const { data: status } = await supabase.from("lot_realtime_status")
      .select("available_spaces, congestion_level")
      .eq("lot_id", board.lot_id)
      .single();

    const template = board.display_template as any;
    const available = status?.available_spaces ?? 0;
    const isFull = status?.congestion_level === 'full';
    const message = isFull
      ? (template?.full_message || '만 차')
      : (template?.format || '잔여 {available}대').replace('{available}', available.toString());

    const { error } = await supabase.from("display_boards").update({
      current_message: message,
      last_push: new Date().toISOString(),
      last_push_success: true,
      last_error: null,
    }).eq("id", board.id);

    if (error) {
      toast({ title: "전송 실패", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "전송 완료", description: `"${message}"` });
      queryClient.invalidateQueries({ queryKey: ["display-boards"] });
    }
  };

  const secondsAgo = (ts?: string | null) => {
    if (!ts) return "—";
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}초 전`;
    return `${Math.round(diff / 60)}분 전`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">안내전광판 관리</h2>
            <p className="text-sm text-muted-foreground">주차 안내 전광판 연동 및 표출 관리</p>
          </div>
          {canEdit && <Button onClick={() => setShowRegister(true)}><Plus className="h-4 w-4 mr-1" />전광판 등록</Button>}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2].map(i => <Skeleton key={i} className="h-52" />)}
          </div>
        ) : (boards || []).length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">등록된 전광판이 없습니다</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(boards || []).map(board => {
              const isFull = board.current_message?.includes('만');
              return (
                <Card key={board.id}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-1">
                          <Monitor className="h-4 w-4" />
                          {board.board_name || board.board_id}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">{board.board_id}</p>
                        <p className="text-xs text-muted-foreground">{(board.parking_lots as any)?.name}</p>
                      </div>
                      <div className="flex gap-1">
                        {board.location_type && (
                          <Badge variant="outline" className="text-[10px]">{DISPLAY_LOCATION_LABELS[board.location_type] || board.location_type}</Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${board.status === 'active' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {board.status === 'active' ? '가동중' : board.status}
                        </Badge>
                      </div>
                    </div>

                    {/* LED-style display */}
                    <div className={`rounded-md px-4 py-3 text-center font-bold text-lg tracking-wider ${isFull ? 'bg-gray-900 text-red-500' : 'bg-gray-900 text-emerald-400'}`}>
                      {board.current_message || '—'}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        마지막 전송: {secondsAgo(board.last_push)}
                        {board.last_push_success === true && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                        {board.last_push_success === false && <XCircle className="h-3 w-3 text-red-500" />}
                      </div>
                      {board.last_error && <span className="text-red-500 text-[10px]">{board.last_error}</span>}
                    </div>

                    {canEdit && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => handleManualPush(board)}>
                        <Send className="h-3.5 w-3.5 mr-1" /> 수동 전송
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Register Dialog */}
        <Dialog open={showRegister} onOpenChange={setShowRegister}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>전광판 등록</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>주차장 *</Label>
                <Select value={form.lot_id || ''} onValueChange={v => updateForm('lot_id', v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{(lots || []).map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>전광판 ID *</Label>
                <Input value={form.board_id || ''} onChange={e => updateForm('board_id', e.target.value)} />
              </div>
              <div>
                <Label>전광판명</Label>
                <Input value={form.board_name || ''} onChange={e => updateForm('board_name', e.target.value)} />
              </div>
              <div>
                <Label>위치</Label>
                <Select value={form.location_type || '__none__'} onValueChange={v => updateForm('location_type', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">미지정</SelectItem>
                    {Object.entries(DISPLAY_LOCATION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>방향</Label>
                <Input value={form.direction || ''} onChange={e => updateForm('direction', e.target.value)} placeholder="예: 북쪽, A입구" />
              </div>
              <div>
                <Label>프로토콜</Label>
                <Select value={form.protocol || '__none__'} onValueChange={v => updateForm('protocol', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">미지정</SelectItem>
                    {Object.entries(DISPLAY_PROTOCOL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>IP</Label>
                <Input value={form.ip_address || ''} onChange={e => updateForm('ip_address', e.target.value)} />
              </div>
              <div>
                <Label>포트</Label>
                <Input type="number" value={form.port || ''} onChange={e => updateForm('port', e.target.value)} />
              </div>
              <div>
                <Label>전광판 유형</Label>
                <Select value={form.display_type || '__none__'} onValueChange={v => updateForm('display_type', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">미지정</SelectItem>
                    <SelectItem value="led_text">LED 텍스트</SelectItem>
                    <SelectItem value="led_graphic">LED 그래픽</SelectItem>
                    <SelectItem value="lcd">LCD</SelectItem>
                    <SelectItem value="full_color">풀컬러</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>전송 주기 (초)</Label>
                <Input type="number" value={form.push_interval_sec || 10} onChange={e => updateForm('push_interval_sec', e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>기본 메시지 형식</Label>
                <Input value={form.template_format || '잔여 {available}대'} onChange={e => updateForm('template_format', e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>만차 메시지</Label>
                <Input value={form.template_full || '만 차'} onChange={e => updateForm('template_full', e.target.value)} />
              </div>
              <div>
                <Label>제조사</Label>
                <Input value={form.manufacturer || ''} onChange={e => updateForm('manufacturer', e.target.value)} />
              </div>
              <div>
                <Label>모델명</Label>
                <Input value={form.model || ''} onChange={e => updateForm('model', e.target.value)} />
              </div>
              <div>
                <Label>설치일</Label>
                <Input type="date" value={form.install_date || ''} onChange={e => updateForm('install_date', e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRegister(false)}>취소</Button>
              <Button onClick={handleRegister}>등록</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
