import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

const MODULE_OPTIONS = [
  { value: 'BUDGET', label: '예산관리' },
  { value: 'PROCUREMENT', label: '입찰관리' },
  { value: 'SERVICE', label: '용역관리' },
  { value: 'SURVEY', label: '현황조사' },
  { value: 'COMPLAINT', label: '민원관리' },
];

const DOC_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  BUDGET: [{ value: 'budget_execution', label: '예산 집행' }, { value: 'budget_transfer', label: '예산 전용' }],
  PROCUREMENT: [{ value: 'contract', label: '계약' }, { value: 'bid_evaluation', label: '입찰 평가' }],
  SERVICE: [{ value: 'payment', label: '기성금 청구' }, { value: 'inspection', label: '점검' }],
  SURVEY: [{ value: 'survey_approval', label: '조사 승인' }],
  COMPLAINT: [{ value: 'complaint_response', label: '민원 회신' }],
};

const ROLE_OPTIONS = [
  { value: 'editor', label: '기안자' },
  { value: 'manager', label: '검토자' },
  { value: 'admin', label: '승인자' },
];

interface StepDef { step: number; role: string; label: string }

export default function ApprovalLineManagement() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: '', module: '', docType: '', isDefault: false });
  const [steps, setSteps] = useState<StepDef[]>([
    { step: 1, role: 'editor', label: '기안' },
    { step: 2, role: 'manager', label: '검토' },
    { step: 3, role: 'admin', label: '승인' },
  ]);

  const { data: lines } = useQuery({
    queryKey: ['approval-lines'],
    queryFn: async () => {
      const { data } = await supabase.from('approval_lines').select('*').order('module, document_type');
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.module || !form.docType) throw new Error('필수 항목을 입력하세요');
      const { error } = await supabase.from('approval_lines').insert({
        line_name: form.name,
        module: form.module,
        document_type: form.docType,
        steps: steps as any,
        is_default: form.isDefault,
        created_by: profile?.id,
        author_name: (form as any).author_name || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-lines'] });
      setDialog(false);
      setForm({ name: '', module: '', docType: '', isDefault: false });
      toast.success('결재선이 등록되었습니다');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('approval_lines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-lines'] });
      toast.success('삭제되었습니다');
    },
  });

  const addStep = () => {
    setSteps(s => [...s, { step: s.length + 1, role: 'manager', label: `단계 ${s.length + 1}` }]);
  };

  const removeStep = (idx: number) => {
    setSteps(s => s.filter((_, i) => i !== idx).map((st, i) => ({ ...st, step: i + 1 })));
  };

  const updateStep = (idx: number, updates: Partial<StepDef>) => {
    setSteps(s => s.map((st, i) => i === idx ? { ...st, ...updates } : st));
  };

  const docTypes = DOC_TYPE_OPTIONS[form.module] || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <GitBranch className="h-4 w-4" />결재선 관리
        </h3>
        <Button size="sm" onClick={() => setDialog(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />결재선 등록
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>결재선명</TableHead>
                <TableHead>모듈</TableHead>
                <TableHead>문서유형</TableHead>
                <TableHead>단계</TableHead>
                <TableHead>기본</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines?.map((line: any) => {
                const lineSteps = (line.steps as StepDef[]) || [];
                return (
                  <TableRow key={line.id}>
                    <TableCell className="text-sm font-medium">{line.line_name}</TableCell>
                    <TableCell className="text-xs">{MODULE_OPTIONS.find(m => m.value === line.module)?.label || line.module}</TableCell>
                    <TableCell className="text-xs">{line.document_type}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {lineSteps.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[9px]">{s.label}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{line.is_default && <Badge className="text-[9px] bg-primary">기본</Badge>}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(line.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!lines || lines.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">등록된 결재선이 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>결재선 등록</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">결재선명</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 예산 집행 결재" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">모듈</Label>
                <Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v, docType: '' }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {MODULE_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">문서유형</Label>
                <Select value={form.docType} onValueChange={v => setForm(f => ({ ...f, docType: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {docTypes.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">결재 단계</Label>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-6" onClick={addStep}>
                  <Plus className="h-3 w-3 mr-1" />단계 추가
                </Button>
              </div>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 border rounded">
                    <Badge variant="outline" className="text-[10px] shrink-0">{s.step}</Badge>
                    <Select value={s.role} onValueChange={v => updateStep(i, { role: v })}>
                      <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={s.label} onChange={e => updateStep(i, { label: e.target.value })} className="h-7 text-xs" placeholder="라벨" />
                    {steps.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeStep(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
              <Label className="text-xs">기본 결재선으로 설정</Label>
            </div>
            <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(f => ({ ...f, author_name: v } as any))} />
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
