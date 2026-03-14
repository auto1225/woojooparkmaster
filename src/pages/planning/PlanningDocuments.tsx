import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { Plus, Upload, FileText } from "lucide-react";
import { DOC_TYPE_LABELS, DOC_CATEGORY_LABELS, REVIEW_STATUS_LABELS } from "@/types/planning";

export default function PlanningDocuments() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const { data: projects } = useQuery({
    queryKey: ["planning-projects-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("id, project_number, project_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: docs, isLoading } = useQuery({
    queryKey: ["planning-docs", selectedProject],
    queryFn: async () => {
      let query = supabase.from("design_documents").select("*").eq("is_current", true);
      if (selectedProject) query = query.eq("project_id", selectedProject);
      const { data, error } = await query.order("category").order("doc_type");
      if (error) throw error;
      return data || [];
    },
  });

  const groupedByCategory = (docs || []).reduce((acc: Record<string, any[]>, doc) => {
    const cat = doc.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  const handleUpload = async () => {
    if (!form.title || !form.project_id || !form.doc_type) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }
    const count = (docs || []).length + 1;
    const docNumber = `DD-${String(count).padStart(4, '0')}`;
    const { error } = await supabase.from("design_documents").insert([{
      project_id: form.project_id,
      doc_number: docNumber,
      doc_type: form.doc_type,
      title: form.title,
      description: form.description || null,
      file_path: form.file_path || `/documents/${docNumber}`,
      file_format: form.file_format || 'pdf',
      version: form.version || 'v1.0',
      version_note: form.version_note || null,
      category: form.category || null,
      uploaded_by: profile?.id,
    }] as any);
    if (error) { toast({ title: "업로드 실패", description: error.message, variant: "destructive" }); return; }
    toast({ title: "도면 등록 완료" });
    logActivity({ module: "PLANNING", action: "document_uploaded", targetType: "design_document", targetName: form.title });
    setShowUpload(false);
    setForm({});
    queryClient.invalidateQueries({ queryKey: ["planning-docs"] });
  };

  const canEdit = profile?.role && ["admin", "manager", "editor"].includes(profile.role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">도면 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">설계도면 버전관리 및 검토</p>
          </div>
          {canEdit && <Button onClick={() => { setForm({ project_id: selectedProject }); setShowUpload(true); }}><Upload className="h-4 w-4 mr-1" />도면 업로드</Button>}
        </div>

        {/* Project Select */}
        <div className="flex gap-3">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[300px]"><SelectValue placeholder="공사 프로젝트 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">전체 프로젝트</SelectItem>
              {(projects || []).map(p => <SelectItem key={p.id} value={p.id}>{p.project_name} ({p.project_number})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Documents by Category */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : Object.keys(groupedByCategory).length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>등록된 도면이 없습니다</p></CardContent></Card>
        ) : (
          <Accordion type="multiple" defaultValue={Object.keys(groupedByCategory)} className="space-y-2">
            {Object.entries(groupedByCategory).map(([cat, catDocs]) => (
              <AccordionItem key={cat} value={cat} className="border rounded-lg">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{DOC_CATEGORY_LABELS[cat] || cat}</span>
                    <Badge variant="outline" className="text-[10px]">{catDocs.length}건</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>번호</TableHead>
                        <TableHead>유형</TableHead>
                        <TableHead>제목</TableHead>
                        <TableHead>버전</TableHead>
                        <TableHead>검토상태</TableHead>
                        <TableHead>업로드일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catDocs.map(d => (
                        <TableRow key={d.id}>
                          <TableCell className="text-xs font-mono">{d.doc_number}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</Badge></TableCell>
                          <TableCell className="font-medium">{d.title}</TableCell>
                          <TableCell className="text-xs">{d.version}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{REVIEW_STATUS_LABELS[d.review_status] || d.review_status}</Badge></TableCell>
                          <TableCell className="text-xs">{d.created_at ? new Date(d.created_at).toLocaleDateString('ko-KR') : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={v => { setShowUpload(v); if (!v) setForm({}); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>도면 업로드</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>공사 프로젝트 *</Label>
              <Select value={form.project_id || ''} onValueChange={v => updateForm('project_id', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{(projects || []).map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>도면유형 *</Label>
              <Select value={form.doc_type || ''} onValueChange={v => updateForm('doc_type', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>카테고리</Label>
              <Select value={form.category || ''} onValueChange={v => updateForm('category', v)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>제목 *</Label><Input value={form.title || ''} onChange={e => updateForm('title', e.target.value)} /></div>
            <div><Label>버전</Label><Input value={form.version || 'v1.0'} onChange={e => updateForm('version', e.target.value)} /></div>
            <div><Label>버전 메모</Label><Textarea value={form.version_note || ''} onChange={e => updateForm('version_note', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>취소</Button>
            <Button onClick={handleUpload}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
