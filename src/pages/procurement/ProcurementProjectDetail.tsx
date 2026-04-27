import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/api/supabase-compat";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";
import {
  BID_TYPE_LABELS, BID_TYPE_COLORS, CONTRACT_TYPE_LABELS, BID_STATUS_LABELS, BID_STATUS_COLORS,
  EVAL_METHOD_LABELS, formatOkWon, DOC_TYPE_LABELS, DOC_CATEGORY_LABELS,
} from "@/types/procurement";
import { ArrowLeft, Plus, Check, X, Upload } from "lucide-react";

export default function ProcurementProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile && ['admin', 'manager'].includes(profile.role);
  const [addSubmissionOpen, setAddSubmissionOpen] = useState(false);
  const [addContractOpen, setAddContractOpen] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['bid-project', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('*, parking_lots(code, name)').eq('id', id!).single();
      return data;
    },
  });

  const { data: submissions, refetch: refetchSubs } = useQuery({
    queryKey: ['bid-submissions', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_submissions').select('*').eq('bid_project_id', id!).order('submitted_at');
      return data || [];
    },
  });

  const { data: evaluations, refetch: refetchEvals } = useQuery({
    queryKey: ['bid-evaluations', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_evaluations').select('*, bid_submissions(company_name, bid_amount, bid_rate)')
        .eq('bid_project_id', id!).order('rank');
      return data || [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ['bid-contracts', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_contracts').select('*').eq('bid_project_id', id!);
      return data || [];
    },
  });

  const { data: documents, refetch: refetchDocs } = useQuery({
    queryKey: ['bid-documents', id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_documents').select('*').eq('bid_project_id', id!).order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Submission form
  const [subForm, setSubForm] = useState({
    company_name: '', business_number: '', representative: '', contact_person: '', contact_phone: '',
    bid_amount: 0, submitted_at: new Date().toISOString().slice(0, 16),
  });

  const handleAddSubmission = async () => {
    if (!subForm.company_name) { toast.error('업체명을 입력해주세요'); return; }
    const count = (submissions?.length || 0) + 1;
    const subNumber = `BS-${project?.bid_number?.split('-').slice(1).join('-')}-${String(count).padStart(2, '0')}`;
    const { error } = await supabase.from('bid_submissions').insert({
      bid_project_id: id!, submission_number: subNumber, company_name: subForm.company_name,
      business_number: subForm.business_number || null, representative: subForm.representative || null,
      contact_person: subForm.contact_person || null, contact_phone: subForm.contact_phone || null,
      bid_amount: subForm.bid_amount || null, submitted_at: subForm.submitted_at ? new Date(subForm.submitted_at).toISOString() : null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('업체 등록 완료');
    await logActivity({ module: 'PROCUREMENT', action: '입찰업체 등록', targetType: 'bid_submissions', targetName: subForm.company_name });
    setAddSubmissionOpen(false);
    setSubForm({ company_name: '', business_number: '', representative: '', contact_person: '', contact_phone: '', bid_amount: 0, submitted_at: new Date().toISOString().slice(0, 16) });
    refetchSubs();
  };

  // Evaluation
  const handleSaveEvaluation = async (submissionId: string, scores: { price: number; technical: number; business: number }) => {
    const total = scores.price + scores.technical + scores.business;
    const existing = evaluations?.find(e => e.submission_id === submissionId);
    if (existing) {
      await supabase.from('bid_evaluations').update({
        price_score: scores.price, technical_score: scores.technical, business_score: scores.business,
        total_score: total,
      }).eq('id', existing.id);
    } else {
      await supabase.from('bid_evaluations').insert({
        bid_project_id: id!, submission_id: submissionId,
        price_score: scores.price, technical_score: scores.technical, business_score: scores.business,
        total_score: total, evaluator_id: profile?.id, evaluator_name: profile?.name,
        evaluation_date: new Date().toISOString().split('T')[0],
      });
    }
    // Update ranks
    const { data: allEvals } = await supabase.from('bid_evaluations').select('id, total_score')
      .eq('bid_project_id', id!).order('total_score', { ascending: false });
    if (allEvals) {
      for (let i = 0; i < allEvals.length; i++) {
        await supabase.from('bid_evaluations').update({ rank: i + 1 }).eq('id', allEvals[i].id);
      }
    }
    toast.success('평가 저장');
    refetchEvals();
  };

  // Status change
  const handleStatusChange = async (newStatus: string) => {
    const payload: any = { status: newStatus };
    if (newStatus === 'announced') payload.announce_date = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('bid_projects').update(payload).eq('id', id!);
    if (error) { toast.error(error.message); return; }
    toast.success(`상태 변경: ${BID_STATUS_LABELS[newStatus]}`);
    await logActivity({ module: 'PROCUREMENT', action: `상태변경→${BID_STATUS_LABELS[newStatus]}`, targetType: 'bid_projects', targetName: project?.title });
    refetchProject();
  };

  // Contract form
  const [ctForm, setCtForm] = useState({
    contractor_name: '', contract_amount: 0, vat_amount: 0, total_amount: 0,
    contract_date: '', contract_start: '', contract_end: '', warranty_months: 12,
    penalty_rate: 0.25, submission_id: '',
  });

  const handleCreateContract = async () => {
    if (!ctForm.contractor_name || !ctForm.contract_date) { toast.error('필수 항목을 입력해주세요'); return; }
    const { data: existing } = await supabase.from('bid_contracts').select('contract_number').order('contract_number', { ascending: false }).limit(1);
    const year = new Date().getFullYear();
    const lastNum = existing?.[0]?.contract_number ? parseInt(existing[0].contract_number.split('-')[2] || '0') : 0;
    const contractNumber = `CT-${year}-${String(lastNum + 1).padStart(3, '0')}`;
    const warrantyEnd = ctForm.contract_end && ctForm.warranty_months
      ? (() => { const d = new Date(ctForm.contract_end); d.setMonth(d.getMonth() + ctForm.warranty_months); return d.toISOString().split('T')[0]; })()
      : null;

    const { error } = await supabase.from('bid_contracts').insert({
      bid_project_id: id!, submission_id: ctForm.submission_id || submissions?.[0]?.id,
      contract_number: contractNumber, contractor_name: ctForm.contractor_name,
      contract_amount: ctForm.contract_amount, vat_amount: ctForm.vat_amount,
      total_amount: ctForm.total_amount || ctForm.contract_amount + ctForm.vat_amount,
      contract_date: ctForm.contract_date, contract_start: ctForm.contract_start, contract_end: ctForm.contract_end,
      warranty_months: ctForm.warranty_months, warranty_end: warrantyEnd,
      penalty_rate: ctForm.penalty_rate, created_by: profile?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('계약 체결 완료');
    await logActivity({ module: 'PROCUREMENT', action: '계약체결', targetType: 'bid_contracts', targetName: contractNumber });
    setAddContractOpen(false);
    refetchProject();
  };

  if (!project) return <DashboardLayout><div className="p-8 text-center">로딩중...</div></DashboardLayout>;

  const statusActions: Record<string, { label: string; next: string }> = {
    draft: { label: '공고', next: 'announced' },
    announced: { label: '입찰 마감', next: 'closed' },
    closed: { label: '평가 시작', next: 'evaluation' },
    evaluation: { label: '낙찰 처리', next: 'awarded' },
  };

  const topRanked = evaluations?.find(e => e.rank === 1);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/procurement/projects')} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />목록
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{project.title}</h1>
              <Badge variant="outline" className="font-mono text-xs">{project.bid_number}</Badge>
              <Badge className={`${BID_STATUS_COLORS[project.status]}`}>{BID_STATUS_LABELS[project.status]}</Badge>
            </div>
            <div className="flex gap-2 mt-1.5">
              <Badge className={`${BID_TYPE_COLORS[project.bid_type]} text-xs`}>{BID_TYPE_LABELS[project.bid_type]}</Badge>
              <Badge variant="outline" className="text-xs">{CONTRACT_TYPE_LABELS[project.contract_type]}</Badge>
              {project.estimated_amount && <span className="text-sm font-medium">추정가: {formatOkWon(project.estimated_amount)}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {statusActions[project.status] && isAdmin && (
              <Button size="sm" onClick={() => handleStatusChange(statusActions[project.status].next)}>
                {statusActions[project.status].label}
              </Button>
            )}
            {project.status === 'awarded' && isAdmin && (
              <Button size="sm" onClick={() => {
                const top = topRanked;
                if (top) {
                  const sub = submissions?.find(s => s.id === top.submission_id);
                  setCtForm(f => ({
                    ...f, contractor_name: sub?.company_name || '', submission_id: top.submission_id,
                    contract_amount: sub?.bid_amount || 0, vat_amount: Math.round((sub?.bid_amount || 0) * 0.1),
                    total_amount: Math.round((sub?.bid_amount || 0) * 1.1),
                  }));
                }
                setAddContractOpen(true);
              }}>계약 체결</Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">사업 정보</TabsTrigger>
            <TabsTrigger value="submissions">참여 업체 ({submissions?.length || 0})</TabsTrigger>
            <TabsTrigger value="evaluation" disabled={!['evaluation', 'awarded', 'contracted'].includes(project.status)}>평가</TabsTrigger>
            <TabsTrigger value="contract" disabled={!['awarded', 'contracted'].includes(project.status)}>낙찰/계약</TabsTrigger>
            <TabsTrigger value="documents">서류 ({documents?.length || 0})</TabsTrigger>
          </TabsList>

          {/* Tab 1: Info */}
          <TabsContent value="info">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">입찰방식</span><span>{BID_TYPE_LABELS[project.bid_type]}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">계약유형</span><span>{CONTRACT_TYPE_LABELS[project.contract_type]}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">분류</span><span>{project.category || '-'}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">평가방법</span><span>{EVAL_METHOD_LABELS[project.evaluation_method || ''] || '-'}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">관련주차장</span><span>{(project.parking_lots as any)?.name || '-'}</span></div>
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">나라장터</span><span>{project.nara_ref || '-'}</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">금액/일정</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">추정가격</span><span className="font-medium">{project.estimated_amount ? `${(project.estimated_amount).toLocaleString()}원` : '-'}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">설계금액</span><span>{project.design_amount ? `${(project.design_amount).toLocaleString()}원` : '-'}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">공고일</span><span>{project.announce_date || '-'}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">마감일</span><span>{project.bid_deadline?.split('T')[0] || '-'}</span></div>
                  <div className="flex justify-between py-1 border-b"><span className="text-muted-foreground">개찰일</span><span>{project.bid_open_date || '-'}</span></div>
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">수행기간</span><span>{project.work_period_days ? `${project.work_period_days}일` : '-'}</span></div>
                </CardContent>
              </Card>
              {project.description && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">사업 개요</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{project.description}</p></CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Tab 2: Submissions */}
          <TabsContent value="submissions">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAddSubmissionOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />업체 등록</Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>접수번호</TableHead>
                        <TableHead>업체명</TableHead>
                        <TableHead>대표자</TableHead>
                        <TableHead className="text-right">투찰금액</TableHead>
                        <TableHead className="text-right">투찰률(%)</TableHead>
                        <TableHead>접수일시</TableHead>
                        <TableHead>유효성</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions?.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm">{s.submission_number}</TableCell>
                          <TableCell className="font-medium">{s.company_name}</TableCell>
                          <TableCell className="text-sm">{s.representative || '-'}</TableCell>
                          <TableCell className="text-right text-sm">{s.bid_amount ? s.bid_amount.toLocaleString() : '-'}</TableCell>
                          <TableCell className="text-right text-sm">{s.bid_rate ? `${s.bid_rate}%` : '-'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{s.submitted_at?.split('T')[0] || '-'}</TableCell>
                          <TableCell><Badge className={s.is_valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{s.is_valid ? '유효' : '무효'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 3: Evaluation */}
          <TabsContent value="evaluation">
            <Card>
              <CardHeader><CardTitle className="text-sm">평가 결과</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>업체명</TableHead>
                      <TableHead className="text-right">투찰금액</TableHead>
                      <TableHead className="text-center">가격(점)</TableHead>
                      <TableHead className="text-center">기술(점)</TableHead>
                      <TableHead className="text-center">경영(점)</TableHead>
                      <TableHead className="text-center font-bold">합계</TableHead>
                      <TableHead className="text-center">순위</TableHead>
                      <TableHead>적격</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions?.map(s => {
                      const ev = evaluations?.find(e => e.submission_id === s.id);
                      return (
                        <TableRow key={s.id} className={ev?.rank === 1 ? 'bg-green-50' : ''}>
                          <TableCell className="font-medium">{s.company_name}</TableCell>
                          <TableCell className="text-right text-sm">{s.bid_amount?.toLocaleString() || '-'}</TableCell>
                          <TableCell className="text-center">
                            {isAdmin ? (
                              <Input type="number" className="w-16 h-7 text-center text-sm mx-auto" defaultValue={ev?.price_score || 0}
                                onBlur={e => handleSaveEvaluation(s.id, { price: Number(e.target.value), technical: ev?.technical_score || 0, business: ev?.business_score || 0 })} />
                            ) : <span>{ev?.price_score || 0}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {isAdmin ? (
                              <Input type="number" className="w-16 h-7 text-center text-sm mx-auto" defaultValue={ev?.technical_score || 0}
                                onBlur={e => handleSaveEvaluation(s.id, { price: ev?.price_score || 0, technical: Number(e.target.value), business: ev?.business_score || 0 })} />
                            ) : <span>{ev?.technical_score || 0}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {isAdmin ? (
                              <Input type="number" className="w-16 h-7 text-center text-sm mx-auto" defaultValue={ev?.business_score || 0}
                                onBlur={e => handleSaveEvaluation(s.id, { price: ev?.price_score || 0, technical: ev?.technical_score || 0, business: Number(e.target.value) })} />
                            ) : <span>{ev?.business_score || 0}</span>}
                          </TableCell>
                          <TableCell className="text-center font-bold">{ev?.total_score || 0}</TableCell>
                          <TableCell className="text-center">{ev?.rank ? `${ev.rank}위` : '-'}</TableCell>
                          <TableCell>{ev ? <Badge className={ev.is_qualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{ev.is_qualified ? '적격' : '부적격'}</Badge> : '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Contract */}
          <TabsContent value="contract">
            {contracts && contracts.length > 0 ? (
              <div className="space-y-4">
                {contracts.map(c => (
                  <Card key={c.id}>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><span className="text-muted-foreground block">계약번호</span><span className="font-mono font-medium">{c.contract_number}</span></div>
                        <div><span className="text-muted-foreground block">계약업체</span><span className="font-medium">{c.contractor_name}</span></div>
                        <div><span className="text-muted-foreground block">계약금액</span><span className="font-medium">{c.total_amount?.toLocaleString()}원</span></div>
                        <div><span className="text-muted-foreground block">계약기간</span><span>{c.contract_start} ~ {c.contract_end}</span></div>
                        <div><span className="text-muted-foreground block">하자보증 종료</span><span>{c.warranty_end || '-'}</span></div>
                        <div><span className="text-muted-foreground block">지체상금율</span><span>{c.penalty_rate}%/일</span></div>
                        <div><span className="text-muted-foreground block">상태</span><Badge variant="outline">{c.status}</Badge></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                {topRanked && <p className="mb-2">1순위 업체: <strong>{(topRanked.bid_submissions as any)?.company_name}</strong> ({topRanked.total_score}점)</p>}
                <p>아직 계약이 체결되지 않았습니다.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* Tab 5: Documents */}
          <TabsContent value="documents">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>카테고리</TableHead>
                      <TableHead>서류유형</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead>버전</TableHead>
                      <TableHead>업로드일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents?.map(d => (
                      <TableRow key={d.id}>
                        <TableCell><Badge variant="outline" className="text-[10px]">{DOC_CATEGORY_LABELS[d.doc_category] || d.doc_category}</Badge></TableCell>
                        <TableCell className="text-sm">{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</TableCell>
                        <TableCell className="font-medium text-sm">{d.title}</TableCell>
                        <TableCell className="text-sm">{d.version}</TableCell>
                        <TableCell className="text-sm">{d.created_at?.split('T')[0]}</TableCell>
                      </TableRow>
                    ))}
                    {!documents?.length && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">등록된 서류가 없습니다</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Submission Dialog */}
        <Dialog open={addSubmissionOpen} onOpenChange={setAddSubmissionOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>참여 업체 등록</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>업체명 *</Label><Input value={subForm.company_name} onChange={e => setSubForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>사업자번호</Label><Input value={subForm.business_number} onChange={e => setSubForm(f => ({ ...f, business_number: e.target.value }))} /></div>
                <div><Label>대표자</Label><Input value={subForm.representative} onChange={e => setSubForm(f => ({ ...f, representative: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>담당자</Label><Input value={subForm.contact_person} onChange={e => setSubForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
                <div><Label>연락처</Label><Input value={subForm.contact_phone} onChange={e => setSubForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
              </div>
              <div>
                <Label>투찰금액 (원)</Label>
                <Input type="number" value={subForm.bid_amount} onChange={e => setSubForm(f => ({ ...f, bid_amount: Number(e.target.value) }))} />
                {project.estimated_amount && subForm.bid_amount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">투찰률: {(subForm.bid_amount / project.estimated_amount * 100).toFixed(2)}%</p>
                )}
              </div>
              <div><Label>접수일시</Label><Input type="datetime-local" value={subForm.submitted_at} onChange={e => setSubForm(f => ({ ...f, submitted_at: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSubmissionOpen(false)}>취소</Button>
              <Button onClick={handleAddSubmission}>등록</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Contract Dialog */}
        <Dialog open={addContractOpen} onOpenChange={setAddContractOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>계약 체결</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>계약업체 *</Label><Input value={ctForm.contractor_name} onChange={e => setCtForm(f => ({ ...f, contractor_name: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>계약금액</Label><Input type="number" value={ctForm.contract_amount} onChange={e => {
                  const amt = Number(e.target.value);
                  setCtForm(f => ({ ...f, contract_amount: amt, vat_amount: Math.round(amt * 0.1), total_amount: Math.round(amt * 1.1) }));
                }} /></div>
                <div><Label>부가세</Label><Input type="number" value={ctForm.vat_amount} onChange={e => setCtForm(f => ({ ...f, vat_amount: Number(e.target.value) }))} /></div>
                <div><Label>총액</Label><Input type="number" value={ctForm.total_amount} onChange={e => setCtForm(f => ({ ...f, total_amount: Number(e.target.value) }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>계약일 *</Label><Input type="date" value={ctForm.contract_date} onChange={e => setCtForm(f => ({ ...f, contract_date: e.target.value }))} /></div>
                <div><Label>시작일</Label><Input type="date" value={ctForm.contract_start} onChange={e => setCtForm(f => ({ ...f, contract_start: e.target.value }))} /></div>
                <div><Label>종료일</Label><Input type="date" value={ctForm.contract_end} onChange={e => setCtForm(f => ({ ...f, contract_end: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>하자보증 (개월)</Label><Input type="number" value={ctForm.warranty_months} onChange={e => setCtForm(f => ({ ...f, warranty_months: Number(e.target.value) }))} /></div>
                <div><Label>지체상금율 (%/일)</Label><Input type="number" step="0.001" value={ctForm.penalty_rate} onChange={e => setCtForm(f => ({ ...f, penalty_rate: Number(e.target.value) }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddContractOpen(false)}>취소</Button>
              <Button onClick={handleCreateContract}>계약 체결</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
