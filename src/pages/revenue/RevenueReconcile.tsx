import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { formatWon, RECON_STATUS_LABELS, RECON_STATUS_COLORS } from "@/types/revenue";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";
import { useIsMobile } from "@/hooks/use-mobile";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";

export default function RevenueReconcile() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const attentionMode = searchParams.get('status') === 'attention';
  const lotTypeParam = searchParams.get('lotType') || 'all';
  const [statusFilter, setStatusFilter] = useState('all');
  const [lotTypeFilter, setLotTypeFilter] = useState(lotTypeParam);
  const [sortKey, setSortKey] = useState('period_desc');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [createForm, setCreateForm] = useState({ lot_id: '', period_month: '' });

  const { data: lots } = useQuery({
    queryKey: ['lots-outsourced'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name, lot_type, operator_type').eq('operator_type', 'outsourced').order('code');
      return data || [];
    },
  });

  const { data: records, refetch } = useQuery({
    queryKey: ['recon-list', statusFilter, attentionMode, lotTypeParam],
    queryFn: async () => {
      let q = supabase.from('revenue_reconciliation').select('*, parking_lots(code, name, lot_type)').order('period_start', { ascending: false });
      if (attentionMode) q = q.in('status', ['pending', 'reviewing', 'discrepancy', 'disputed']);
      else if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: attentionCounts } = useQuery({
    queryKey: ['revenue-attention-counts', lotTypeParam],
    queryFn: async () => {
      const [unverified, missing, reconciliation, lotRows] = await Promise.all([
        supabase.from('revenue_daily').select('id, lot_id, parking_lots(lot_type)').eq('verified', false),
        (supabase.from('revenue_missing_days' as never) as any).select('lot_id'),
        supabase.from('revenue_reconciliation').select('id, lot_id, parking_lots(lot_type)').in('status', ['pending', 'reviewing', 'discrepancy', 'disputed']),
        supabase.from('parking_lots').select('id, lot_type'),
      ]);
      const lotTypes = new Map((lotRows.data || []).map((lot: any) => [lot.id, lot.lot_type]));
      const matches = (lotType?: string | null) => lotTypeParam === 'all'
        || (lotTypeParam === 'other' && !['offstreet', 'multilevel', 'onstreet'].includes(lotType || ''))
        || lotType === lotTypeParam;
      const unverifiedCount = (unverified.data || []).filter((item: any) => matches(item.parking_lots?.lot_type)).length;
      const missingCount = (missing.data || []).filter((item: any) => matches(lotTypes.get(item.lot_id))).length;
      const reconciliationCount = (reconciliation.data || []).filter((item: any) => matches(item.parking_lots?.lot_type)).length;
      return { unverified: unverifiedCount, missing: missingCount, reconciliation: reconciliationCount, total: unverifiedCount + missingCount + reconciliationCount };
    },
    enabled: attentionMode,
  });

  const attentionScopeLabel = useMemo(() => ({ all: '전체', offstreet: '노외주차장', multilevel: '주차빌딩', onstreet: '노상주차장', other: '기타·미지정' }[lotTypeParam] || '전체'), [lotTypeParam]);

  const displayedRecords = useMemo(() => {
    const rows = (records || []).filter((item: any) => lotTypeFilter === 'all'
      || (lotTypeFilter === 'other' && !['offstreet', 'multilevel', 'onstreet'].includes(item.parking_lots?.lot_type || ''))
      || item.parking_lots?.lot_type === lotTypeFilter);
    return [...rows].sort((a: any, b: any) => {
      const reportedA = (a.reported_cash || 0) + (a.reported_card || 0) + (a.reported_mobile || 0) + (a.reported_monthly_pass || 0) + (a.reported_other || 0);
      const reportedB = (b.reported_cash || 0) + (b.reported_card || 0) + (b.reported_mobile || 0) + (b.reported_monthly_pass || 0) + (b.reported_other || 0);
      if (sortKey === 'period_asc') return String(a.period_start).localeCompare(String(b.period_start));
      if (sortKey === 'lot') return String(a.parking_lots?.name || '').localeCompare(String(b.parking_lots?.name || ''), 'ko');
      if (sortKey === 'lot_type') return String(a.parking_lots?.lot_type || '').localeCompare(String(b.parking_lots?.lot_type || ''));
      if (sortKey === 'reported_desc') return reportedB - reportedA;
      if (sortKey === 'diff_desc') return Math.abs(b.diff_rate || 0) - Math.abs(a.diff_rate || 0);
      if (sortKey === 'status') return String(a.status).localeCompare(String(b.status));
      return String(b.period_start).localeCompare(String(a.period_start));
    });
  }, [records, lotTypeFilter, sortKey]);

  useEffect(() => {
    const recordId = searchParams.get('record');
    if (!recordId || !records?.length || detailItem) return;
    const linkedRecord = records.find((record: any) => record.id === recordId);
    if (linkedRecord) openDetail(linkedRecord);
  }, [records, searchParams, detailItem]);

  const handleCreate = async () => {
    if (!createForm.lot_id || !createForm.period_month) { toast.error('주차장과 기간을 선택해주세요'); return; }
    const { data, error } = await (supabase.rpc as any)('create_revenue_reconciliation', {
      p_lot_id: createForm.lot_id,
      p_period_month: `${createForm.period_month}-01`,
      p_client_mutation_id: crypto.randomUUID(),
    });
    if (error) { toast.error(error.message); return; }
    const reconNumber = data?.[0]?.recon_number || createForm.period_month;
    toast.success('대사 생성 완료');
    await logActivity({ module: 'REVENUE', action: '위탁대사 생성', targetType: 'revenue_reconciliation', targetName: reconNumber });
    setCreateOpen(false);
    refetch();
  };

  // Detail editing
  const [reportedForm, setReportedForm] = useState({ cash: 0, card: 0, mobile: 0, monthlyPass: 0, other: 0, vehicles: 0, exemptions: 0 });
  const [analysisForm, setAnalysisForm] = useState({ diff_analysis: '', resolution_type: '', resolution_note: '' });

  const openDetail = (r: any) => {
    setDetailItem(r);
    setReportedForm({ cash: r.reported_cash || 0, card: r.reported_card || 0, mobile: r.reported_mobile || 0, monthlyPass: r.reported_monthly_pass || 0, other: r.reported_other || 0, vehicles: r.reported_vehicles || 0, exemptions: r.reported_exemptions || 0 });
    setAnalysisForm({ diff_analysis: r.diff_analysis || '', resolution_type: r.resolution_type || '', resolution_note: r.resolution_note || '' });
  };

  const handleSaveDetail = async (newStatus?: string) => {
    if (!detailItem) return;
    const targetStatus = newStatus || detailItem.status;
    const numbers = Object.values(reportedForm);
    if (numbers.some(value => !Number.isFinite(value) || value < 0)) { toast.error('업체 보고 금액과 건수는 0 이상이어야 합니다'); return; }
    const { error } = await (supabase.rpc as any)('save_revenue_reconciliation', {
      p_reconciliation_id: detailItem.id,
      p_reported_cash: reportedForm.cash,
      p_reported_card: reportedForm.card,
      p_reported_mobile: reportedForm.mobile,
      p_reported_monthly_pass: reportedForm.monthlyPass,
      p_reported_other: reportedForm.other,
      p_reported_vehicles: reportedForm.vehicles,
      p_reported_exemptions: reportedForm.exemptions,
      p_diff_analysis: analysisForm.diff_analysis,
      p_resolution_type: analysisForm.resolution_type,
      p_resolution_note: analysisForm.resolution_note,
      p_target_status: targetStatus,
      p_expected_updated_at: detailItem.updated_at,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('저장 완료');
    setDetailItem(null);
    refetch();
  };

  const diffColor = (v: number) => v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-green-600';
  const fmtNum = (n: number) => n.toLocaleString();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">위탁수입 대사</h1>
            <p className="text-sm text-muted-foreground mt-1">위탁운영 업체가 보고한 수입과 시스템 집계 수입을 비교하여 차이를 분석합니다.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />대사 생성</Button>
        </div>

        {attentionMode ? <Card className="border-amber-300">
          <CardHeader><CardTitle className="text-base">수입 확인 필요 {attentionCounts?.total?.toLocaleString() || 0}건 <span className="ml-2 text-sm font-normal text-muted-foreground">{attentionScopeLabel} 기준</span></CardTitle></CardHeader>
          <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-3">
            <div className="bg-card p-4"><p className="text-xs text-muted-foreground">일수입 미검증</p><p className="mt-1 text-xl font-semibold tabular-nums">{attentionCounts?.unverified?.toLocaleString() || 0}건</p></div>
            <div className="bg-card p-4"><p className="text-xs text-muted-foreground">일수입 누락일</p><p className="mt-1 text-xl font-semibold tabular-nums">{attentionCounts?.missing?.toLocaleString() || 0}건</p></div>
            <div className="bg-card p-4"><p className="text-xs text-muted-foreground">미해결 위탁 대사</p><p className="mt-1 text-xl font-semibold tabular-nums">{attentionCounts?.reconciliation?.toLocaleString() || 0}건</p></div>
          </CardContent>
        </Card> : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {Object.entries(RECON_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
            <SelectTrigger aria-label="주차장 형태 필터"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 주차장 형태</SelectItem>
              <SelectItem value="offstreet">노외주차장</SelectItem>
              <SelectItem value="multilevel">주차빌딩</SelectItem>
              <SelectItem value="onstreet">노상주차장</SelectItem>
              <SelectItem value="other">기타·미지정</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger aria-label="대사 정렬"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="period_desc">기간 최신순</SelectItem>
              <SelectItem value="period_asc">기간 오래된순</SelectItem>
              <SelectItem value="lot">주차장명순</SelectItem>
              <SelectItem value="lot_type">주차장 형태순</SelectItem>
              <SelectItem value="reported_desc">업체보고액 큰순</SelectItem>
              <SelectItem value="diff_desc">차이율 큰순</SelectItem>
              <SelectItem value="status">처리상태순</SelectItem>
            </SelectContent>
          </Select>
          {attentionMode ? <span className="text-xs text-muted-foreground">아래 목록은 미해결 위탁 대사 {records?.length || 0}건입니다.</span> : null}
        </div>

        <Card>
          <CardContent className="p-0">
            {isMobile ? <div className="divide-y">
              {displayedRecords.map((r: any) => {
                const reported = (r.reported_cash || 0) + (r.reported_card || 0) + (r.reported_mobile || 0) + (r.reported_monthly_pass || 0) + (r.reported_other || 0);
                const system = (r.system_cash || 0) + (r.system_card || 0) + (r.system_mobile || 0) + (r.system_monthly_pass || 0) + (r.system_other || 0);
                return <button type="button" key={r.id} className="w-full space-y-2 p-4 text-left" onClick={() => openDetail(r)}>
                  <div className="flex items-start justify-between gap-2"><span><span className="block font-mono text-xs text-muted-foreground">{r.recon_number}</span><span className="font-medium">{r.parking_lots?.name || '-'}</span></span><Badge className={`${RECON_STATUS_COLORS[r.status] || ''} shrink-0`}>{RECON_STATUS_LABELS[r.status] || r.status}</Badge></div>
                  <div className="flex flex-wrap gap-1"><Badge variant="outline">{LOT_TYPE_LABELS[r.parking_lots?.lot_type as LotType] || '형태 미지정'}</Badge><span className="text-xs text-muted-foreground">{r.period_start} ~ {r.period_end}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-xs"><span>업체 <strong>{formatWon(reported)}</strong></span><span>시스템 <strong>{formatWon(system)}</strong></span><span className={diffColor(reported - system)}>차이 <strong>{formatWon(reported - system)}</strong></span></div>
                </button>;
              })}
              {displayedRecords.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 대사가 없습니다.</p> : null}
            </div> : <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>대사번호</TableHead>
                  <TableHead>주차장명</TableHead>
                  <TableHead>업체명</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">업체보고</TableHead>
                  <TableHead className="text-right">시스템집계</TableHead>
                  <TableHead className="text-right">차이</TableHead>
                  <TableHead className="text-right">차이율(%)</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRecords.map(r => {
                  const rTotal = (r.reported_cash || 0) + (r.reported_card || 0) + (r.reported_mobile || 0) + (r.reported_monthly_pass || 0) + (r.reported_other || 0);
                  const sTotal = (r.system_cash || 0) + (r.system_card || 0) + (r.system_mobile || 0) + (r.system_monthly_pass || 0) + (r.system_other || 0);
                  const diff = rTotal - sTotal;
                  const highDiff = Math.abs(r.diff_rate || 0) > 5;
                  return (
                    <TableRow key={r.id} className={`cursor-pointer ${highDiff ? 'bg-red-50/50' : ''}`} onClick={() => openDetail(r)}>
                      <TableCell className="font-mono text-sm">{r.recon_number}</TableCell>
                      <TableCell>{(r.parking_lots as any)?.name || '-'}</TableCell>
                      <TableCell>{r.company_name || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.period_start} ~ {r.period_end}</TableCell>
                      <TableCell className="text-right">{fmtNum(rTotal)}</TableCell>
                      <TableCell className="text-right">{fmtNum(sTotal)}</TableCell>
                      <TableCell className={`text-right font-medium ${diffColor(diff)}`}>{diff > 0 ? '+' : ''}{fmtNum(diff)}</TableCell>
                      <TableCell className={`text-right ${diffColor(r.diff_rate || 0)}`}>{r.diff_rate || 0}%</TableCell>
                      <TableCell><Badge className={`${RECON_STATUS_COLORS[r.status] || ''} text-xs`}>{RECON_STATUS_LABELS[r.status] || r.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>대사 생성</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>위탁운영 주차장</Label>
                <Select value={createForm.lot_id} onValueChange={v => setCreateForm(f => ({ ...f, lot_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name} · {LOT_TYPE_LABELS[(l as any).lot_type as LotType] || '형태 미지정'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>대사 기간 (월)</Label>
                <Input type="month" value={createForm.period_month}
                  onInput={e => setCreateForm(f => ({ ...f, period_month: (e.target as HTMLInputElement).value }))}
                  onChange={e => setCreateForm(f => ({ ...f, period_month: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate}>생성</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>대사 상세 — {detailItem?.recon_number}</DialogTitle></DialogHeader>
            {detailItem && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {(detailItem.parking_lots as any)?.name} · {detailItem.company_name || '-'} · {detailItem.period_start} ~ {detailItem.period_end}
                </div>

                {/* Comparison table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>구분</TableHead>
                      <TableHead className="text-right">업체 보고</TableHead>
                      <TableHead className="text-right">시스템 집계</TableHead>
                      <TableHead className="text-right">차이</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { label: '현금', rKey: 'cash', sKey: 'system_cash' },
                      { label: '카드', rKey: 'card', sKey: 'system_card' },
                      { label: '모바일', rKey: 'mobile', sKey: 'system_mobile' },
                      { label: '월정기권', rKey: 'monthlyPass', sKey: 'system_monthly_pass' },
                      { label: '기타', rKey: 'other', sKey: 'system_other' },
                    ].map(({ label, rKey, sKey }) => {
                      const rVal = (reportedForm as any)[rKey] || 0;
                      const sVal = detailItem[sKey] || 0;
                      const d = rVal - sVal;
                      return (
                        <TableRow key={rKey}>
                          <TableCell>{label}</TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={0} inputMode="numeric" disabled={['matched', 'resolved'].includes(detailItem.status)} className="w-32 text-right ml-auto" value={rVal}
                              onChange={e => setReportedForm(f => ({ ...f, [rKey]: Number(e.target.value) || 0 }))} />
                          </TableCell>
                          <TableCell className="text-right">{fmtNum(sVal)}</TableCell>
                          <TableCell className={`text-right font-medium ${diffColor(d)}`}>{d > 0 ? '+' : ''}{fmtNum(d)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold">
                      <TableCell>합계</TableCell>
                      <TableCell className="text-right">{fmtNum(reportedForm.cash + reportedForm.card + reportedForm.mobile + reportedForm.monthlyPass + reportedForm.other)}</TableCell>
                      <TableCell className="text-right">{fmtNum((detailItem.system_cash || 0) + (detailItem.system_card || 0) + (detailItem.system_mobile || 0) + (detailItem.system_monthly_pass || 0) + (detailItem.system_other || 0))}</TableCell>
                      <TableCell className={`text-right ${diffColor((reportedForm.cash + reportedForm.card + reportedForm.mobile + reportedForm.monthlyPass + reportedForm.other) - ((detailItem.system_cash || 0) + (detailItem.system_card || 0) + (detailItem.system_mobile || 0) + (detailItem.system_monthly_pass || 0) + (detailItem.system_other || 0)))}`}>
                        {fmtNum((reportedForm.cash + reportedForm.card + reportedForm.mobile + reportedForm.monthlyPass + reportedForm.other) - ((detailItem.system_cash || 0) + (detailItem.system_card || 0) + (detailItem.system_mobile || 0) + (detailItem.system_monthly_pass || 0) + (detailItem.system_other || 0)))}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>이용차량</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} inputMode="numeric" disabled={['matched', 'resolved'].includes(detailItem.status)} className="w-32 text-right ml-auto" value={reportedForm.vehicles}
                          onChange={e => setReportedForm(f => ({ ...f, vehicles: Number(e.target.value) || 0 }))} />
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(detailItem.system_vehicles || 0)}</TableCell>
                      <TableCell className={`text-right ${diffColor(reportedForm.vehicles - (detailItem.system_vehicles || 0))}`}>
                        {fmtNum(reportedForm.vehicles - (detailItem.system_vehicles || 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="space-y-3">
                  <div><Label>차이 분석</Label><Textarea disabled={['matched', 'resolved'].includes(detailItem.status)} value={analysisForm.diff_analysis} onChange={e => setAnalysisForm(f => ({ ...f, diff_analysis: e.target.value }))} placeholder="불일치 원인과 확인 근거를 기록" /></div>
                  <div>
                    <Label>처리 방법</Label>
                    <Select disabled={['matched', 'resolved'].includes(detailItem.status)} value={analysisForm.resolution_type} onValueChange={v => setAnalysisForm(f => ({ ...f, resolution_type: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accepted">업체보고 수용</SelectItem>
                        <SelectItem value="adjusted">금액 조정</SelectItem>
                        <SelectItem value="corrected">시스템 수정</SelectItem>
                        <SelectItem value="disputed">이의제기</SelectItem>
                        <SelectItem value="written_off">대손처리</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>처리 소견</Label><Textarea disabled={['matched', 'resolved'].includes(detailItem.status)} value={analysisForm.resolution_note} onChange={e => setAnalysisForm(f => ({ ...f, resolution_note: e.target.value }))} /></div>
                </div>

                <DialogFooter className="flex gap-2">
                  {detailItem.status === 'pending' ? <Button variant="outline" onClick={() => handleSaveDetail('reviewing')}>검토 시작</Button> : null}
                  {['pending', 'reviewing'].includes(detailItem.status) ? <Button variant="outline" className="text-green-700" onClick={() => handleSaveDetail('matched')}>차이 없음·일치</Button> : null}
                  {['pending', 'reviewing'].includes(detailItem.status) ? <Button variant="outline" className="text-red-700" onClick={() => handleSaveDetail('discrepancy')}>불일치 등록</Button> : null}
                  {['reviewing', 'discrepancy'].includes(detailItem.status) ? <Button variant="outline" onClick={() => handleSaveDetail('disputed')}>업체 이의제기</Button> : null}
                  {['discrepancy', 'disputed'].includes(detailItem.status) && ['admin', 'manager'].includes(profile?.role || '') ? <Button onClick={() => handleSaveDetail('resolved')}>조치 완료</Button> : null}
                  {['matched', 'resolved'].includes(detailItem.status) ? <Button variant="outline" onClick={() => setDetailItem(null)}>닫기</Button> : null}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
