import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, Download, AlertTriangle, LockKeyhole } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { formatWon, DATA_SOURCE_LABELS } from "@/types/revenue";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";
import { closeRevenuePeriod } from "@/lib/workflow-commands";
import { useIsMobile } from "@/hooks/use-mobile";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { localDateIso, monthStart, previousMonthKey, revenueTotal, validateRevenueNumbers, type RevenueSortKey } from "@/lib/revenue-controls";

export default function RevenueDaily() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [lotFilter, setLotFilter] = useState('all');
  const [lotTypeFilter, setLotTypeFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortKey, setSortKey] = useState<RevenueSortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<any>(null);

  const now = new Date();
  const defaultStart = monthStart(now);
  const defaultEnd = localDateIso(now);
  const [dateStart, setDateStart] = useState(defaultStart);
  const [dateEnd, setDateEnd] = useState(defaultEnd);
  const [closeMonth, setCloseMonth] = useState(previousMonthKey(now));

  const { data: lots } = useQuery({
    queryKey: ['parking-lots-select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('parking_lots').select('id, code, name, lot_type').order('code');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: records, refetch } = useQuery({
    queryKey: ['revenue-daily', lotFilter, dateStart, dateEnd, verifiedFilter, sourceFilter],
    queryFn: async () => {
      let q = supabase.from('revenue_daily').select('*, parking_lots(code, name, lot_type)')
        .gte('revenue_date', dateStart).lte('revenue_date', dateEnd)
        .order('revenue_date', { ascending: false });
      if (lotFilter !== 'all') q = q.eq('lot_id', lotFilter);
      if (verifiedFilter === 'verified') q = q.eq('verified', true);
      if (verifiedFilter === 'unverified') q = q.eq('verified', false);
      if (sourceFilter !== 'all') q = q.eq('data_source', sourceFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: missingDays = [], refetch: refetchMissing } = useQuery({
    queryKey: ['revenue-missing-days', lotFilter, closeMonth],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_revenue_missing_days', {
        p_lot_id: lotFilter === 'all' ? null : lotFilter,
        p_period_month: `${closeMonth}-01`,
      });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: periodClose, refetch: refetchClose } = useQuery({
    queryKey: ['revenue-period-close', lotFilter, closeMonth],
    queryFn: async () => {
      if (lotFilter === 'all') return null;
      const { data } = await (supabase.from('revenue_period_closes' as any) as any)
        .select('*').eq('lot_id', lotFilter).eq('period_month', `${closeMonth}-01`).maybeSingle();
      return data || null;
    },
    enabled: lotFilter !== 'all',
  });

  const displayedRecords = useMemo(() => {
    const rows = (records || []).filter((record: any) => {
      const lotType = record.parking_lots?.lot_type || '';
      return lotTypeFilter === 'all'
        || (lotTypeFilter === 'other' && !['offstreet', 'multilevel', 'onstreet'].includes(lotType))
        || lotType === lotTypeFilter;
    });
    const value = (record: any) => {
      const total = revenueTotal(record);
      if (sortKey === 'lot') return record.parking_lots?.name || '';
      if (sortKey === 'lot_type') return record.parking_lots?.lot_type || '';
      if (sortKey === 'total') return total;
      if (sortKey === 'cash_ratio') return total > 0 ? (record.cash_amount || 0) / total : 0;
      if (sortKey === 'exemption_rate') return total + (record.exemption_amount || 0) > 0 ? (record.exemption_amount || 0) / (total + (record.exemption_amount || 0)) : 0;
      if (sortKey === 'verified') return record.verified ? 1 : 0;
      return record.revenue_date || '';
    };
    return [...rows].sort((a, b) => {
      const av = value(a); const bv = value(b);
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ko-KR', { numeric: true });
      return sortDirection === 'asc' ? result : -result;
    });
  }, [lotTypeFilter, records, sortDirection, sortKey]);

  const totals = useMemo(() => {
    return displayedRecords.reduce((s, r) => ({
      cash: s.cash + (r.cash_amount || 0),
      card: s.card + (r.card_amount || 0),
      mobile: s.mobile + (r.mobile_amount || 0),
      pass: s.pass + (r.monthly_pass_amount || 0),
      other: s.other + (r.other_amount || 0),
      total: s.total + (r.cash_amount || 0) + (r.card_amount || 0) + (r.mobile_amount || 0) + (r.monthly_pass_amount || 0) + (r.other_amount || 0),
      vehicles: s.vehicles + (r.total_vehicles || 0),
      exCount: s.exCount + (r.exemption_count || 0),
      exAmount: s.exAmount + (r.exemption_amount || 0),
    }), { cash: 0, card: 0, mobile: 0, pass: 0, other: 0, total: 0, vehicles: 0, exCount: 0, exAmount: 0 });
  }, [displayedRecords]);

  // Form state
  const [form, setForm] = useState({
    lot_id: '', revenue_date: defaultEnd, data_source: 'manual',
    cash_amount: 0, card_amount: 0, mobile_amount: 0, monthly_pass_amount: 0, other_amount: 0,
    total_vehicles: 0, peak_hour: '', avg_parking_minutes: 0,
    exemption_count: 0, exemption_amount: 0, discrepancy_note: '',
  });

  const formTotal = form.cash_amount + form.card_amount + form.mobile_amount + form.monthly_pass_amount + form.other_amount;

  const openNew = () => {
    setEditItem(null);
    setForm({ lot_id: '', revenue_date: defaultEnd, data_source: 'manual', cash_amount: 0, card_amount: 0, mobile_amount: 0, monthly_pass_amount: 0, other_amount: 0, total_vehicles: 0, peak_hour: '', avg_parking_minutes: 0, exemption_count: 0, exemption_amount: 0, discrepancy_note: '' });
    setDialogOpen(true);
  };

  const openEdit = (r: any) => {
    if (r.verified) {
      toast.info('검증 완료된 수입은 원본 보존을 위해 수정할 수 없습니다', { description: '정정이 필요한 경우 월 마감 전에 관리자에게 정정 요청을 등록하세요.' });
    }
    setEditItem(r);
    setForm({
      lot_id: r.lot_id, revenue_date: r.revenue_date, data_source: r.data_source || 'manual',
      cash_amount: r.cash_amount || 0, card_amount: r.card_amount || 0, mobile_amount: r.mobile_amount || 0,
      monthly_pass_amount: r.monthly_pass_amount || 0, other_amount: r.other_amount || 0,
      total_vehicles: r.total_vehicles || 0, peak_hour: r.peak_hour || '', avg_parking_minutes: r.avg_parking_minutes || 0,
      exemption_count: r.exemption_count || 0, exemption_amount: r.exemption_amount || 0, discrepancy_note: r.discrepancy_note || '',
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    const recordId = searchParams.get('record');
    if (!recordId || !records?.length || dialogOpen) return;
    const linkedRecord = records.find((record: any) => record.id === recordId);
    if (linkedRecord) openEdit(linkedRecord);
  }, [records, searchParams, dialogOpen]);

  const handleSave = async () => {
    if (!form.lot_id || !form.revenue_date) { toast.error('주차장과 날짜를 선택해주세요'); return; }
    if (editItem?.verified) { toast.error('검증 완료된 수입은 수정할 수 없습니다'); return; }
    const numericValues = [form.cash_amount, form.card_amount, form.mobile_amount, form.monthly_pass_amount, form.other_amount, form.total_vehicles, form.avg_parking_minutes, form.exemption_count, form.exemption_amount];
    if (!validateRevenueNumbers(numericValues)) { toast.error('금액과 건수에는 0 이상의 숫자만 입력할 수 있습니다'); return; }
    if (form.exemption_count === 0 && form.exemption_amount > 0) { toast.error('감면 금액이 있으면 감면 건수도 입력해주세요'); return; }
    const payload = {
      lot_id: form.lot_id, revenue_date: form.revenue_date, data_source: form.data_source,
      cash_amount: form.cash_amount, card_amount: form.card_amount, mobile_amount: form.mobile_amount,
      monthly_pass_amount: form.monthly_pass_amount, other_amount: form.other_amount,
      total_vehicles: form.total_vehicles, peak_hour: form.peak_hour || null,
      avg_parking_minutes: form.avg_parking_minutes || null,
      exemption_count: form.exemption_count, exemption_amount: form.exemption_amount,
      discrepancy_note: form.discrepancy_note || null,
      input_by: profile?.id,
    };

    const clientMutationId = editItem?.client_mutation_id || crypto.randomUUID();
    const { error } = await (supabase.rpc as any)('save_revenue_daily', {
      p_record_id: editItem?.id || null,
      p_lot_id: payload.lot_id,
      p_revenue_date: payload.revenue_date,
      p_data_source: payload.data_source,
      p_cash_amount: payload.cash_amount,
      p_card_amount: payload.card_amount,
      p_mobile_amount: payload.mobile_amount,
      p_monthly_pass_amount: payload.monthly_pass_amount,
      p_other_amount: payload.other_amount,
      p_total_vehicles: payload.total_vehicles,
      p_peak_hour: payload.peak_hour,
      p_avg_parking_minutes: payload.avg_parking_minutes,
      p_exemption_count: payload.exemption_count,
      p_exemption_amount: payload.exemption_amount,
      p_discrepancy_note: payload.discrepancy_note,
      p_client_mutation_id: clientMutationId,
      p_expected_updated_at: editItem?.updated_at || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(editItem ? '수정 완료' : '입력 완료');
    await logActivity({ module: 'REVENUE', action: editItem ? '수입 수정' : '수입 입력', targetType: 'revenue_daily', targetName: form.revenue_date });
    setDialogOpen(false);
    refetch();
  };

  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    if (!profile || !['admin', 'manager'].includes(profile.role)) { toast.error('검증 권한이 없습니다'); return; }
    const selected = (records || []).filter((record: any) => selectedIds.has(record.id) && !record.verified);
    for (const record of selected) {
      const { error } = await (supabase.rpc as any)('verify_revenue_daily', { p_record_id: record.id, p_expected_updated_at: record.updated_at });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`${selected.length}건 검증 완료`);
    await logActivity({ module: 'REVENUE', action: `수입 일괄 검증 ${selected.length}건`, targetType: 'revenue_daily' });
    setSelectedIds(new Set());
    refetch();
  };

  const handlePeriodClose = async () => {
    if (lotFilter === 'all') { toast.error('마감할 주차장을 선택해주세요'); return; }
    try {
      await closeRevenuePeriod(lotFilter, `${closeMonth}-01`);
      toast.success(`${closeMonth} 수입을 마감했습니다`);
      await Promise.all([refetch(), refetchMissing(), refetchClose()]);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const canVerify = profile && ['admin', 'manager'].includes(profile.role);
  const fmtNum = (n: number) => n.toLocaleString();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">일별 수입</h1>
          <div className="flex gap-2">
            {canVerify && selectedIds.size > 0 && (
              <Button variant="outline" onClick={handleBulkVerify}>
                <CheckCircle className="h-4 w-4 mr-1" />선택 검증 ({selectedIds.size}건)
              </Button>
            )}
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />수입 입력</Button>
          </div>
        </div>

        <section className="grid grid-cols-1 border bg-card md:grid-cols-[minmax(0,1fr)_auto]" aria-label="월 마감 통제">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">마감 대상 월</p>
              <Input type="month" value={closeMonth} onChange={(event) => setCloseMonth(event.target.value)} className="mt-1 h-8 w-36" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">누락 주차장·일자</p>
              <p className={`mt-1 text-lg font-semibold ${missingDays.length ? 'text-destructive' : 'text-foreground'}`}>
                {missingDays.length}건
              </p>
            </div>
            {missingDays.length > 0 && <p className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-4 w-4" />누락 수입을 입력해야 마감할 수 있습니다</p>}
          </div>
          <div className="flex items-center border-t px-4 py-3 md:border-l md:border-t-0">
            <Button
              onClick={handlePeriodClose}
              disabled={!canVerify || lotFilter === 'all' || missingDays.length > 0 || Boolean(periodClose?.is_closed)}
            >
              <LockKeyhole className="mr-1 h-4 w-4" />{periodClose?.is_closed ? '마감 완료' : '월 마감'}
            </Button>
          </div>
        </section>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-40">
                <Label className="text-xs">주차장 형태</Label>
                <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
                  <SelectTrigger aria-label="주차장 형태"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 형태</SelectItem>
                    <SelectItem value="offstreet">노외주차장</SelectItem>
                    <SelectItem value="multilevel">주차빌딩</SelectItem>
                    <SelectItem value="onstreet">노상주차장</SelectItem>
                    <SelectItem value="other">기타·미지정</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label className="text-xs">주차장</Label>
                <Select value={lotFilter} onValueChange={setLotFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">시작일</Label>
                <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-36" />
              </div>
              <div>
                <Label className="text-xs">종료일</Label>
                <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-36" />
              </div>
              <div className="w-32">
                <Label className="text-xs">검증 상태</Label>
                <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="unverified">미검증</SelectItem>
                    <SelectItem value="verified">검증완료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <Label className="text-xs">데이터출처</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Label className="text-xs">정렬 기준</Label>
                <Select value={sortKey} onValueChange={(value) => setSortKey(value as RevenueSortKey)}>
                  <SelectTrigger aria-label="정렬 기준"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">수입일</SelectItem>
                    <SelectItem value="lot">주차장명</SelectItem>
                    <SelectItem value="lot_type">주차장 형태</SelectItem>
                    <SelectItem value="total">총수입</SelectItem>
                    <SelectItem value="cash_ratio">현금 비중</SelectItem>
                    <SelectItem value="exemption_rate">감면율</SelectItem>
                    <SelectItem value="verified">검증 상태</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')}>
                {sortDirection === 'asc' ? '오름차순' : '내림차순'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="divide-y">
                {displayedRecords.map((record: any) => {
                  const total = revenueTotal(record);
                  return (
                    <div key={record.id} className={record.verified ? 'p-4' : 'bg-amber-50/50 p-4'}>
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(record)}>
                          <p className="truncate text-sm font-semibold">{record.parking_lots?.name || '주차장 미지정'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{record.revenue_date} · {DATA_SOURCE_LABELS[record.data_source] || record.data_source}</p>
                        </button>
                        <Badge variant={record.verified ? 'secondary' : 'outline'}>{record.verified ? '검증완료' : '미검증'}</Badge>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <Badge variant="outline" className="text-[10px]">{LOT_TYPE_LABELS[record.parking_lots?.lot_type as LotType] || '형태 미지정'}</Badge>
                          <p className="mt-2 text-xs text-muted-foreground">차량 {fmtNum(record.total_vehicles || 0)}대 · 감면 {fmtNum(record.exemption_amount || 0)}원</p>
                        </div>
                        <p className="text-lg font-bold tabular-nums text-primary">{formatWon(total)}</p>
                      </div>
                      {canVerify && !record.verified ? <Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => { setSelectedIds(new Set([record.id])); }}><CheckCircle className="mr-1 h-4 w-4" />검증 대상으로 선택</Button> : null}
                    </div>
                  );
                })}
                {displayedRecords.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 수입 자료가 없습니다.</p> : null}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canVerify && <TableHead className="w-10"><Checkbox aria-label="미검증 수입 전체 선택" checked={displayedRecords.some((record: any) => !record.verified) && selectedIds.size === displayedRecords.filter((record: any) => !record.verified).length} onCheckedChange={(c) => { if (c) setSelectedIds(new Set(displayedRecords.filter((record: any) => !record.verified).map((record: any) => record.id))); else setSelectedIds(new Set()); }} /></TableHead>}
                    <TableHead>날짜</TableHead>
                    <TableHead>주차장명</TableHead>
                    <TableHead className="text-right">현금</TableHead>
                    <TableHead className="text-right">카드</TableHead>
                    <TableHead className="text-right">모바일</TableHead>
                    <TableHead className="text-right">월정기</TableHead>
                    <TableHead className="text-right font-bold text-primary">합계</TableHead>
                    <TableHead className="text-right">차량수</TableHead>
                    <TableHead className="text-right">감면건수</TableHead>
                    <TableHead className="text-right">감면액</TableHead>
                    <TableHead>출처</TableHead>
                    <TableHead>검증</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRecords.map(r => {
                    const total = (r.cash_amount || 0) + (r.card_amount || 0) + (r.mobile_amount || 0) + (r.monthly_pass_amount || 0) + (r.other_amount || 0);
                    return (
                      <TableRow key={r.id} className={`${r.verified ? '' : 'cursor-pointer bg-yellow-50/50'}`} onClick={() => openEdit(r)} title={r.verified ? '검증 완료 원본' : '수입 수정'}>
                        {canVerify && <TableCell onClick={e => e.stopPropagation()}><Checkbox aria-label={`${(r.parking_lots as any)?.name || '주차장'} ${r.revenue_date} 검증 선택`} disabled={r.verified} checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></TableCell>}
                        <TableCell className="whitespace-nowrap">{r.revenue_date}</TableCell>
                        <TableCell><div>{(r.parking_lots as any)?.name || '-'}</div><Badge variant="outline" className="mt-1 text-[10px]">{LOT_TYPE_LABELS[(r.parking_lots as any)?.lot_type as LotType] || '형태 미지정'}</Badge></TableCell>
                        <TableCell className="text-right">{fmtNum(r.cash_amount || 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.card_amount || 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.mobile_amount || 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.monthly_pass_amount || 0)}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{fmtNum(total)}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.total_vehicles || 0)}</TableCell>
                        <TableCell className="text-right">{r.exemption_count || 0}</TableCell>
                        <TableCell className="text-right">{fmtNum(r.exemption_amount || 0)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{DATA_SOURCE_LABELS[r.data_source] || r.data_source}</Badge></TableCell>
                        <TableCell>{r.verified ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle className="h-4 w-4" />검증완료</span> : <span className="text-xs text-muted-foreground">미검증</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold bg-muted/50">
                    {canVerify && <TableCell />}
                    <TableCell colSpan={2}>합계</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.cash)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.card)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.mobile)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.pass)}</TableCell>
                    <TableCell className="text-right text-primary">{fmtNum(totals.total)}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.vehicles)}</TableCell>
                    <TableCell className="text-right">{totals.exCount}</TableCell>
                    <TableCell className="text-right">{fmtNum(totals.exAmount)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Input Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editItem ? '수입 수정' : '수입 입력'}</DialogTitle></DialogHeader>
            {editItem?.verified ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">검증 완료 원본입니다. 조회만 가능하며 정정은 별도 절차로 처리합니다.</div> : null}
            <fieldset disabled={Boolean(editItem?.verified)} className="space-y-4 disabled:opacity-75">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>주차장 *</Label>
                  <Select value={form.lot_id} onValueChange={v => setForm(f => ({ ...f, lot_id: v }))} disabled={Boolean(editItem)}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>날짜 *</Label>
                  <Input type="date" value={form.revenue_date}
                    onInput={e => setForm(f => ({ ...f, revenue_date: (e.target as HTMLInputElement).value }))}
                    onChange={e => setForm(f => ({ ...f, revenue_date: e.target.value }))} disabled={Boolean(editItem)} />
                </div>
              </div>
              <div>
                <Label>데이터 출처</Label>
                <Select value={form.data_source} onValueChange={v => setForm(f => ({ ...f, data_source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">결제수단별 수입</p>
                {[
                  ['cash_amount', '현금'], ['card_amount', '카드'], ['mobile_amount', '모바일결제'],
                  ['monthly_pass_amount', '월정기권'], ['other_amount', '기타']
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Label className="w-24 text-xs">{label}</Label>
                    <Input type="number" min="0" inputMode="numeric" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))} className="text-right" />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1 border-t">
                  <Label className="w-24 text-xs font-bold">합계</Label>
                  <p className="text-right flex-1 font-bold text-primary text-lg">{formatWon(formTotal)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><Label className="text-xs">이용 차량수</Label><Input type="number" min="0" inputMode="numeric" value={form.total_vehicles} onChange={e => setForm(f => ({ ...f, total_vehicles: Number(e.target.value) || 0 }))} /></div>
                <div>
                  <Label className="text-xs">최대 혼잡 시간</Label>
                  <Select value={form.peak_hour} onValueChange={v => setForm(f => ({ ...f, peak_hour: v }))}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00').map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">평균주차(분)</Label><Input type="number" min="0" inputMode="numeric" value={form.avg_parking_minutes} onChange={e => setForm(f => ({ ...f, avg_parking_minutes: Number(e.target.value) || 0 }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">감면 건수</Label><Input type="number" min="0" inputMode="numeric" value={form.exemption_count} onChange={e => setForm(f => ({ ...f, exemption_count: Number(e.target.value) || 0 }))} /></div>
                <div><Label className="text-xs">감면 금액</Label><Input type="number" min="0" inputMode="numeric" value={form.exemption_amount} onChange={e => setForm(f => ({ ...f, exemption_amount: Number(e.target.value) || 0 }))} /></div>
              </div>
              <div><Label className="text-xs">비고</Label><Input value={form.discrepancy_note} onChange={e => setForm(f => ({ ...f, discrepancy_note: e.target.value }))} placeholder="특이사항" /></div>
              <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(f => ({ ...f, author_name: v } as any))} />
            </fieldset>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{editItem?.verified ? '닫기' : '취소'}</Button>
              {!editItem?.verified ? <Button onClick={handleSave}>저장</Button> : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
