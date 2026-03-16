import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-logger";
import { BID_TYPE_LABELS, CONTRACT_TYPE_LABELS, EVAL_METHOD_LABELS } from "@/types/procurement";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

const bidTypeDescriptions: Record<string, string> = {
  open: '2인 이상 경쟁 입찰 — 가장 일반적', limited: '특정 자격 제한 경쟁',
  private: '3인 이상 지명 업체 경쟁', negotiation: '1인 수의계약 — 사유 필수',
};

export default function ProcurementProjectNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    title: '', bid_type: 'open', contract_type: 'service', category: '', lot_id: '',
    estimated_amount: 0, design_amount: 0, vat_included: true, description: '', scope_of_work: '', location: '',
    work_period_days: 0, work_start_date: '', work_end_date: '',
    qualification: '', evaluation_method: 'qualification', lowest_price_rate: 87.745,
    nara_ref: '', announce_date: '', bid_start_date: '', bid_deadline: '', bid_open_date: '', bid_open_location: '',
    assigned_to: '', author_name: '',
  });

  const { data: lots } = useQuery({
    queryKey: ['parking-lots-select'],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, code, name').order('code');
      return data || [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['profiles-select'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.title) { toast.error('사업명을 입력해주세요'); return; }
    const { data: existing } = await supabase.from('bid_projects').select('bid_number').order('bid_number', { ascending: false }).limit(1);
    const year = new Date().getFullYear();
    const lastNum = existing?.[0]?.bid_number ? parseInt(existing[0].bid_number.split('-')[2] || '0') : 0;
    const bidNumber = `BD-${year}-${String(lastNum + 1).padStart(3, '0')}`;

    const { error } = await supabase.from('bid_projects').insert({
      bid_number: bidNumber, title: form.title, bid_type: form.bid_type, contract_type: form.contract_type,
      category: form.category || null, lot_id: form.lot_id || null,
      estimated_amount: form.estimated_amount || null, design_amount: form.design_amount || null,
      vat_included: form.vat_included, description: form.description || null,
      scope_of_work: form.scope_of_work || null, location: form.location || null,
      work_period_days: form.work_period_days || null,
      work_start_date: form.work_start_date || null, work_end_date: form.work_end_date || null,
      qualification: form.qualification || null, evaluation_method: form.evaluation_method,
      lowest_price_rate: form.evaluation_method === 'lowest_price' ? form.lowest_price_rate : null,
      nara_ref: form.nara_ref || null,
      announce_date: form.announce_date || null, bid_start_date: form.bid_start_date || null,
      bid_deadline: form.bid_deadline ? new Date(form.bid_deadline).toISOString() : null,
      bid_open_date: form.bid_open_date || null, bid_open_location: form.bid_open_location || null,
      assigned_to: form.assigned_to || null, created_by: profile?.id,
      author_name: (form as any).author_name || profile?.name || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('입찰 사업 등록 완료');
    await logActivity({ module: 'PROCUREMENT', action: '입찰사업 등록', targetType: 'bid_projects', targetName: form.title });
    navigate('/procurement/projects');
  };

  const stepTitles = ['기본 정보', '사업 내용', '입찰 조건', '일정'];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/procurement/projects')} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />목록
        </Button>
        <h1 className="text-2xl font-bold">입찰 사업 등록</h1>

        {/* Step indicator */}
        <div className="flex gap-1">
          {stepTitles.map((t, i) => (
            <div key={i} className={`flex-1 text-center py-2 text-xs font-medium rounded ${step === i + 1 ? 'bg-primary text-primary-foreground' : step > i + 1 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {i + 1}. {t}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {step === 1 && (
              <>
                <div><Label>사업명 *</Label><Input value={form.title} onChange={e => update('title', e.target.value)} placeholder="예: 중앙주차장 차단기 교체 공사" /></div>
                <div>
                  <Label>입찰 방식 *</Label>
                  <RadioGroup value={form.bid_type} onValueChange={v => update('bid_type', v)} className="mt-2 space-y-2">
                    {Object.entries(BID_TYPE_LABELS).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2">
                        <RadioGroupItem value={k} id={`bt-${k}`} className="mt-0.5" />
                        <div><label htmlFor={`bt-${k}`} className="text-sm font-medium cursor-pointer">{v}</label>
                          <p className="text-xs text-muted-foreground">{bidTypeDescriptions[k]}</p></div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div>
                  <Label>계약 유형 *</Label>
                  <RadioGroup value={form.contract_type} onValueChange={v => update('contract_type', v)} className="mt-2 flex gap-4 flex-wrap">
                    {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <RadioGroupItem value={k} id={`ct-${k}`} />
                        <label htmlFor={`ct-${k}`} className="text-sm cursor-pointer">{v}</label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                <div><Label>분류</Label><Input value={form.category} onChange={e => update('category', e.target.value)} placeholder="시설보수, 장비구매, 청소 등" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>관련 주차장</Label>
                    <Select value={form.lot_id} onValueChange={v => update('lot_id', v)}>
                      <SelectTrigger><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
                      <SelectContent>{lots?.map(l => <SelectItem key={l.id} value={l.id}>[{l.code}] {l.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>담당자</Label>
                    <Select value={form.assigned_to} onValueChange={v => update('assigned_to', v)}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{profiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>추정가격 (원)</Label><Input type="number" value={form.estimated_amount} onChange={e => update('estimated_amount', Number(e.target.value))} /></div>
                  <div><Label>설계금액 (원)</Label><Input type="number" value={form.design_amount} onChange={e => update('design_amount', Number(e.target.value))} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.vat_included} onCheckedChange={v => update('vat_included', v)} />
                  <Label>부가세 포함</Label>
                </div>
                <div><Label>사업 개요</Label><Textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3} /></div>
                <div><Label>수행 범위</Label><Textarea value={form.scope_of_work} onChange={e => update('scope_of_work', e.target.value)} rows={3} /></div>
                <div><Label>수행 장소</Label><Input value={form.location} onChange={e => update('location', e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>수행기간 (일)</Label><Input type="number" value={form.work_period_days} onChange={e => update('work_period_days', Number(e.target.value))} /></div>
                  <div><Label>시작 예정일</Label><Input type="date" value={form.work_start_date} onChange={e => update('work_start_date', e.target.value)} /></div>
                  <div><Label>종료 예정일</Label><Input type="date" value={form.work_end_date} onChange={e => update('work_end_date', e.target.value)} /></div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div><Label>참가자격</Label><Textarea value={form.qualification} onChange={e => update('qualification', e.target.value)} rows={3} placeholder="등록업종 XXX 보유, 최근 3년 유사실적 1건 이상..." /></div>
                <div>
                  <Label>평가 방법</Label>
                  <Select value={form.evaluation_method} onValueChange={v => update('evaluation_method', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(EVAL_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {form.evaluation_method === 'lowest_price' && (
                  <div><Label>최저가 하한율 (%)</Label><Input type="number" step="0.001" value={form.lowest_price_rate} onChange={e => update('lowest_price_rate', Number(e.target.value))} /></div>
                )}
                <div><Label>나라장터 공고번호</Label><Input value={form.nara_ref} onChange={e => update('nara_ref', e.target.value)} placeholder="선택사항" /></div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>공고일</Label><Input type="date" value={form.announce_date} onChange={e => update('announce_date', e.target.value)} /></div>
                  <div><Label>입찰 시작일</Label><Input type="date" value={form.bid_start_date} onChange={e => update('bid_start_date', e.target.value)} /></div>
                </div>
                <div><Label>입찰 마감일시</Label><Input type="datetime-local" value={form.bid_deadline} onChange={e => update('bid_deadline', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>개찰일</Label><Input type="date" value={form.bid_open_date} onChange={e => update('bid_open_date', e.target.value)} /></div>
                  <div><Label>개찰 장소</Label><Input value={form.bid_open_location} onChange={e => update('bid_open_location', e.target.value)} /></div>
                </div>
                <AuthorField value={form.author_name} onChange={v => update('author_name', v)} />
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : navigate('/procurement/projects')} disabled={step === 1}>
            <ArrowLeft className="h-4 w-4 mr-1" />이전
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>다음<ArrowRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button onClick={handleSubmit}><Check className="h-4 w-4 mr-1" />등록</Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
