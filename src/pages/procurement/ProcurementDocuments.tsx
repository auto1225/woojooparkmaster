import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DOC_TYPE_LABELS, DOC_CATEGORY_LABELS } from "@/types/procurement";
import { useAuth } from "@/hooks/useAuth";
import { getSecureUploadPath, validateUploadFile } from "@/lib/file-security";
import { ArrowRight, FileDown, FileUp, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ProcurementDocuments() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const canEdit = profile && ['admin', 'manager', 'editor'].includes(profile.role);
  const [projectFilter, setProjectFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showRegister, setShowRegister] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ projectId: '', category: 'bid', type: 'specification', title: '', version: '1.0', description: '' });

  const { data: projects } = useQuery({
    queryKey: ['bid-projects-for-docs'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects').select('id, title, bid_number').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: documents } = useQuery({
    queryKey: ['all-bid-documents', projectFilter, categoryFilter],
    queryFn: async () => {
      let q = supabase.from('bid_documents').select('*, bid_projects(title, bid_number)').eq('is_current', true).order('created_at', { ascending: false });
      if (projectFilter !== 'all') q = q.eq('bid_project_id', projectFilter);
      if (categoryFilter !== 'all') q = q.eq('doc_category', categoryFilter);
      const { data } = await q;
      return data || [];
    },
  });

  // Checklist for selected project
  const requiredDocTypes = ['specification', 'task_order', 'estimate', 'announcement', 'contract', 'performance_bond'];
  const selectedProjectDocs = projectFilter !== 'all' ? documents : [];
  const submittedTypes = new Set(selectedProjectDocs?.map(d => d.doc_type) || []);

  const openRegister = () => {
    setForm((current) => ({ ...current, projectId: projectFilter === 'all' ? '' : projectFilter }));
    setFile(null);
    setRegisterError('');
    setShowRegister(true);
  };

  const handleRegister = async () => {
    const actorId = user?.id || profile?.id;
    if (!actorId) {
      setRegisterError('사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요.');
      toast.error('사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요.');
      return;
    }
    if (!form.projectId || !form.title.trim() || !file) {
      setRegisterError('사업, 제목, 원문 파일을 모두 입력해주세요.');
      toast.error('사업, 제목, 원문 파일을 모두 입력해주세요.');
      return;
    }
    setRegisterError('');
    setSaving(true);
    let uploadedPath = '';
    let uploadedBucket = 'official-documents';
    try {
      const validation = await validateUploadFile(file, 'document');
      if (!validation.isValid) throw new Error(validation.errors.join(' '));
      uploadedPath = `${actorId}/procurement/${form.projectId}/${getSecureUploadPath('document', file.name)}`;
      const { error: uploadError } = await supabase.storage.from(uploadedBucket).upload(uploadedPath, file, { upsert: false });
      if (uploadError) {
        const canUsePrivateDevFallback = import.meta.env.DEV
          && /bucket not found/i.test(uploadError.message)
          && ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.type);
        if (!canUsePrivateDevFallback) throw uploadError;
        uploadedBucket = 'reports';
        const { error: fallbackError } = await supabase.storage.from(uploadedBucket).upload(uploadedPath, file, { upsert: false });
        if (fallbackError) throw fallbackError;
      }
      const { error } = await supabase.from('bid_documents').insert({
        bid_project_id: form.projectId,
        doc_category: form.category,
        doc_type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        version: form.version.trim() || '1.0',
        file_path: `${uploadedBucket}://${uploadedPath}`,
        file_format: file.name.split('.').pop()?.toLowerCase() || null,
        file_size: file.size,
        uploaded_by: actorId,
        is_current: true,
      });
      if (error) throw error;
      toast.success('입찰 서류와 원문 파일을 등록했습니다');
      setShowRegister(false);
      setForm({ projectId: '', category: 'bid', type: 'specification', title: '', version: '1.0', description: '' });
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ['all-bid-documents'] });
    } catch (error: any) {
      if (uploadedPath) await supabase.storage.from(uploadedBucket).remove([uploadedPath]);
      const message = error.message || '서류 등록에 실패했습니다';
      setRegisterError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFile = async (filePath: string) => {
    const storagePath = filePath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
    if (!storagePath) {
      toast.error('이 서류에는 열 수 있는 원문 파일이 연결되지 않았습니다.');
      return;
    }
    const { data, error } = await supabase.storage.from(storagePath[1]).createSignedUrl(storagePath[2], 60);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">서류 관리</h1>
          {canEdit && <Button onClick={openRegister}><FileUp className="mr-1.5 h-4 w-4" />서류 등록</Button>}
        </div>

        <div className="flex gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-64"><SelectValue placeholder="사업 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 사업</SelectItem>
              {projects?.map(p => <SelectItem key={p.id} value={p.id}>[{p.bid_number}] {p.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Checklist */}
        {projectFilter !== 'all' && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-2">서류 체크리스트</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {requiredDocTypes.map(dt => (
                  <div key={dt} className="flex items-center gap-1.5 text-sm">
                    <span>{submittedTypes.has(dt) ? '✅' : '❌'}</span>
                    <span>{DOC_TYPE_LABELS[dt] || dt}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사업명</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>서류유형</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>버전</TableHead>
                  <TableHead>형식</TableHead>
                  <TableHead>업로드일</TableHead>
                  <TableHead className="text-right">실행</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents?.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{(d.bid_projects as any)?.title}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{DOC_CATEGORY_LABELS[d.doc_category] || d.doc_category}</Badge></TableCell>
                    <TableCell className="text-sm">{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</TableCell>
                    <TableCell className="font-medium text-sm">{d.title}</TableCell>
                    <TableCell className="text-sm">{d.version}</TableCell>
                    <TableCell className="text-sm">{d.file_format || '-'}</TableCell>
                    <TableCell className="text-sm">{d.created_at?.split('T')[0]}</TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-1">{/^[a-z0-9-]+:\/\//i.test(d.file_path || '') && <Button size="icon" variant="ghost" title="원문 열기" onClick={() => handleOpenFile(d.file_path)}><FileDown className="h-4 w-4" /></Button>}<Button size="sm" variant="outline" onClick={() => navigate(`/procurement/projects/${d.bid_project_id}?tab=documents`)}>관리 <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div></TableCell>
                  </TableRow>
                ))}
                {!documents?.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">등록된 서류가 없습니다</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={showRegister} onOpenChange={setShowRegister}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>입찰 서류 등록</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>입찰 사업 *</Label><Select value={form.projectId} onValueChange={(projectId) => setForm((current) => ({ ...current, projectId }))}><SelectTrigger><SelectValue placeholder="사업 선택" /></SelectTrigger><SelectContent>{projects?.map((project) => <SelectItem key={project.id} value={project.id}>[{project.bid_number}] {project.title}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>카테고리 *</Label><Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOC_CATEGORY_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>서류 유형 *</Label><Select value={form.type} onValueChange={(type) => setForm((current) => ({ ...current, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOC_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-[1fr_100px] gap-3"><div><Label>제목 *</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div><div><Label>버전</Label><Input value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></div></div>
              <div><Label>원문 파일 *</Label><Input type="file" accept=".pdf,.hwp,.docx,.xlsx,.pptx" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
              <div><Label>설명</Label><Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
              {registerError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{registerError}</p>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowRegister(false)}>취소</Button><Button onClick={handleRegister} disabled={saving || !form.projectId || !form.title.trim() || !file}>{saving && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}등록</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
