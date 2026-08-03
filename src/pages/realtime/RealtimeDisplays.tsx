import { useMemo, useState } from "react";
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
import { Monitor, Plus, Send, CheckCircle, XCircle, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { DISPLAY_LOCATION_LABELS, DISPLAY_PROTOCOL_LABELS } from "@/types/realtime";
import { OperationalListControls } from "@/components/common/OperationalListControls";
import { archiveRealtimeDevice, createRealtimeDisplay, queueDisplayPush, updateRealtimeDevice } from "@/lib/workflow-commands";
import { getParkingLotTypeLabel } from "@/lib/parking-lot-type-labels";

export default function RealtimeDisplays() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("status");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [pushingBoardId, setPushingBoardId] = useState<string | null>(null);
  const [manageBoard, setManageBoard] = useState<any>(null);
  const [manageForm, setManageForm] = useState<Record<string, any>>({});
  const [archiveReason, setArchiveReason] = useState("");

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
      return data || [];
    },
  });

  const { data: boards, isLoading } = useQuery({
    queryKey: ["display-boards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("display_boards")
        .select("*, parking_lots(code, name, lot_type)")
        .is("archived_at", null)
        .order("lot_id").order("board_id");
      if (error) throw error;
      return data || [];
    },
  });

  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const filteredBoards = useMemo(() => {
    const rows = (boards || []).filter((board) => {
      const lot = board.parking_lots as any;
      if (lotFilter !== "all" && board.lot_id !== lotFilter) return false;
      if (lotTypeFilter !== "all" && lot?.lot_type !== lotTypeFilter) return false;
      if (statusFilter !== "all" && board.status !== statusFilter) return false;
      const needle = search.trim().toLocaleLowerCase("ko");
      return !needle || [board.board_id, board.board_name, board.direction, board.ip_address, board.manufacturer, board.model, board.current_message, lot?.name]
        .some((value) => String(value || "").toLocaleLowerCase("ko").includes(needle));
    });
    const value = (board: any) => sortKey === "board" ? board.board_id : sortKey === "lot" ? board.parking_lots?.name : sortKey === "push" ? board.last_push : sortKey === "installed" ? board.install_date : board.status;
    return [...rows].sort((a, b) => {
      const result = String(value(a) || "").localeCompare(String(value(b) || ""), "ko");
      return sortDirection === "asc" ? result : -result;
    });
  }, [boards, lotFilter, lotTypeFilter, search, sortDirection, sortKey, statusFilter]);

  const handleRegister = async () => {
    if (!form.lot_id || !form.board_id) {
      toast({ title: "필수 항목을 입력하세요", variant: "destructive" });
      return;
    }
    const template = {
      format: form.template_format || '잔여 {available}대',
      full_message: form.template_full || '만 차',
    };
    try {
      await createRealtimeDisplay({ ...form, display_template: template }, crypto.randomUUID());
      await logActivity({ module: "realtime", action: "create", targetType: "display_board", targetName: form.board_id });
      toast({ title: "전광판이 등록되었습니다" });
      setShowRegister(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ["display-boards"] });
    } catch (error) {
      toast({ title: "등록 실패", description: error instanceof Error ? error.message : "등록하지 못했습니다.", variant: "destructive" });
    }
  };

  const handleManualPush = async (board: any) => {
    setPushingBoardId(board.id);
    try {
      const command = await queueDisplayPush(board.id, crypto.randomUUID());
      toast({ title: "전송 요청 등록", description: `장비 응답 대기 중: “${command.message}”` });
      queryClient.invalidateQueries({ queryKey: ["display-boards"] });
    } catch (error) {
      toast({ title: "전송 요청 실패", description: error instanceof Error ? error.message : "요청을 등록하지 못했습니다.", variant: "destructive" });
    } finally {
      setPushingBoardId(null);
    }
  };

  const openManage = (board: any) => {
    setManageBoard(board);
    setArchiveReason("");
    setManageForm({ board_name: board.board_name || "", ip_address: board.ip_address || "", direction: board.direction || "", status: board.status });
  };

  const saveBoard = async () => {
    if (!manageBoard) return;
    try {
      await updateRealtimeDevice("display", manageBoard.id, manageForm, manageBoard.row_version);
      toast({ title: "전광판 정보를 수정했습니다" });
      setManageBoard(null);
      queryClient.invalidateQueries({ queryKey: ["display-boards"] });
    } catch (error) {
      toast({ title: "수정 실패", description: error instanceof Error ? error.message : "수정하지 못했습니다.", variant: "destructive" });
    }
  };

  const archiveBoard = async () => {
    if (!manageBoard) return;
    try {
      await archiveRealtimeDevice("display", manageBoard.id, archiveReason, manageBoard.row_version);
      toast({ title: "전광판을 보관했습니다" });
      setManageBoard(null);
      queryClient.invalidateQueries({ queryKey: ["display-boards"] });
    } catch (error) {
      toast({ title: "보관 실패", description: error instanceof Error ? error.message : "보관하지 못했습니다.", variant: "destructive" });
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

        <OperationalListControls
          search={search} onSearchChange={setSearch} searchPlaceholder="전광판ID, 주차장, IP, 메시지 검색"
          lots={(lots || []).map((lot) => ({ value: lot.id, label: `${lot.name} · ${getParkingLotTypeLabel(lot.lot_type)}` }))}
          lotId={lotFilter} onLotChange={setLotFilter}
          categories={[{ value: "offstreet", label: "노외주차장" }, { value: "multilevel", label: "주차빌딩" }, { value: "onstreet", label: "노상주차장" }]}
          category={lotTypeFilter} onCategoryChange={setLotTypeFilter} categoryLabel="전체 주차장 유형"
          statuses={[{ value: "active", label: "가동중" }, { value: "offline", label: "오프라인" }, { value: "error", label: "오류" }, { value: "maintenance", label: "점검중" }]}
          status={statusFilter} onStatusChange={setStatusFilter}
          sortOptions={[{ value: "status", label: "상태순" }, { value: "push", label: "마지막 전송순" }, { value: "installed", label: "설치일순" }, { value: "lot", label: "주차장순" }, { value: "board", label: "전광판ID순" }]}
          sortKey={sortKey} onSortKeyChange={setSortKey} sortDirection={sortDirection} onSortDirectionChange={setSortDirection}
          resultCount={filteredBoards.length} totalCount={(boards || []).length}
          onReset={() => { setSearch(""); setLotFilter("all"); setLotTypeFilter("all"); setStatusFilter("all"); setSortKey("status"); setSortDirection("asc"); }}
        />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2].map(i => <Skeleton key={i} className="h-52" />)}
          </div>
        ) : filteredBoards.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">등록된 전광판이 없습니다</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredBoards.map(board => {
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
                        <p className="text-xs text-muted-foreground">{(board.parking_lots as any)?.name} · {getParkingLotTypeLabel((board.parking_lots as any)?.lot_type || board.lot_type_snapshot)}</p>
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
                        {board.last_push && board.last_push_success == null && <Badge variant="outline" className="text-[10px]">응답 대기</Badge>}
                      </div>
                      {board.last_error && <span className="text-red-500 text-[10px]">{board.last_error}</span>}
                    </div>

                    {canEdit && <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleManualPush(board)} disabled={pushingBoardId === board.id}>
                        <Send className="h-3.5 w-3.5 mr-1" /> {pushingBoardId === board.id ? "요청 중" : "전송 요청"}
                      </Button>
                      <Button size="icon" variant="outline" title="전광판 관리" onClick={() => openManage(board)}><Settings2 className="h-3.5 w-3.5" /></Button>
                    </div>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={!!manageBoard} onOpenChange={(open) => !open && setManageBoard(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>전광판 관리 — {manageBoard?.board_id}</DialogTitle></DialogHeader>
            {manageBoard && <div className="space-y-3">
              <div><Label>전광판명</Label><Input value={manageForm.board_name || ""} onChange={(event) => setManageForm((value) => ({ ...value, board_name: event.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>IP 주소</Label><Input value={manageForm.ip_address || ""} onChange={(event) => setManageForm((value) => ({ ...value, ip_address: event.target.value }))} /></div><div><Label>상태</Label><Select value={manageForm.status || "active"} onValueChange={(status) => setManageForm((value) => ({ ...value, status }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">가동중</SelectItem><SelectItem value="maintenance">점검중</SelectItem><SelectItem value="offline">오프라인</SelectItem><SelectItem value="error">오류</SelectItem></SelectContent></Select></div></div>
              <div><Label>표출 방향</Label><Input value={manageForm.direction || ""} onChange={(event) => setManageForm((value) => ({ ...value, direction: event.target.value }))} /></div>
              <Button className="w-full" onClick={saveBoard}>수정 저장</Button>
              <div className="flex gap-2"><Input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="보관 사유 3자 이상" /><Button variant="destructive" disabled={archiveReason.trim().length < 3} onClick={archiveBoard}>보관</Button></div>
            </div>}
          </DialogContent>
        </Dialog>

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
