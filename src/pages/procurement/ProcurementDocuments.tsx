import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { DOC_TYPE_LABELS, DOC_CATEGORY_LABELS } from "@/types/procurement";

export default function ProcurementDocuments() {
  const [projectFilter, setProjectFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">서류 관리</h1>

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
                  </TableRow>
                ))}
                {!documents?.length && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">서류가 없습니다</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
