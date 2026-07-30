import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { Upload, FileText } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import {
  DOC_TYPE_LABELS,
  DOC_CATEGORY_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/types/planning";

type PlanningProject = {
  id: string;
  project_number: string;
  project_name: string;
};

type DesignDocument = {
  id: string;
  category?: string | null;
  doc_number: string;
  doc_type: string;
  title: string;
  version?: string | null;
  review_status?: string | null;
  created_at?: string | null;
};

type DocumentForm = {
  project_id?: string;
  doc_type?: string;
  title?: string;
  description?: string;
  file_path?: string;
  file_format?: string;
  version?: string;
  version_note?: string;
  category?: string;
  author_name?: string;
};

const docTypeLabels = DOC_TYPE_LABELS as Record<string, string>;
const docCategoryLabels = DOC_CATEGORY_LABELS as Record<string, string>;
const reviewStatusLabels = REVIEW_STATUS_LABELS as Record<string, string>;

export default function PlanningDocuments() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("__all__");
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<DocumentForm>({});

  const updateForm = <K extends keyof DocumentForm>(
    key: K,
    value: DocumentForm[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const { data: projects = [] } = useQuery<PlanningProject[]>({
    queryKey: ["planning-projects-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("id, project_number, project_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PlanningProject[];
    },
  });

  const { data: docs = [], isLoading } = useQuery<DesignDocument[]>({
    queryKey: ["planning-docs", selectedProject],
    queryFn: async () => {
      let query = supabase
        .from("design_documents")
        .select("*")
        .eq("is_current", true);
      if (selectedProject !== "__all__") {
        query = query.eq("project_id", selectedProject);
      }
      const { data, error } = await query
        .order("category")
        .order("doc_type");
      if (error) throw error;
      return (data || []) as DesignDocument[];
    },
  });

  const groupedByCategory = docs.reduce<Record<string, DesignDocument[]>>(
    (grouped, document) => {
      const category = document.category || "other";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(document);
      return grouped;
    },
    {},
  );

  const handleUpload = async () => {
    if (!form.title || !form.project_id || !form.doc_type) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }

    const documentNumber = `DD-${String(docs.length + 1).padStart(4, "0")}`;
    const { error } = await supabase.from("design_documents").insert([
      {
        project_id: form.project_id,
        doc_number: documentNumber,
        doc_type: form.doc_type,
        title: form.title,
        description: form.description || null,
        file_path: form.file_path || `/documents/${documentNumber}`,
        file_format: form.file_format || "pdf",
        version: form.version || "v1.0",
        version_note: form.version_note || null,
        category: form.category || null,
        uploaded_by: profile?.id,
      },
    ]);

    if (error) {
      toast({
        title: "업로드 실패",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "도면 등록 완료" });
    logActivity({
      module: "PLANNING",
      action: "document_uploaded",
      targetType: "design_document",
      targetName: form.title,
    });
    setShowUpload(false);
    setForm({});
    queryClient.invalidateQueries({ queryKey: ["planning-docs"] });
  };

  const canEdit = Boolean(
    profile?.role && ["admin", "manager", "editor"].includes(profile.role),
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">도면 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              설계도면 버전관리 및 검토
            </p>
          </div>
          {canEdit && (
            <Button
              onClick={() => {
                setForm({
                  project_id:
                    selectedProject === "__all__" ? "" : selectedProject,
                });
                setShowUpload(true);
              }}
            >
              <Upload className="h-4 w-4 mr-1" />도면 업로드
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="공사 프로젝트 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 프로젝트</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.project_name} ({project.project_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : Object.keys(groupedByCategory).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>등록된 도면이 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={Object.keys(groupedByCategory)}
            className="space-y-2"
          >
            {Object.entries(groupedByCategory).map(
              ([category, categoryDocuments]) => (
                <AccordionItem
                  key={category}
                  value={category}
                  className="border rounded-lg"
                >
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {docCategoryLabels[category] || category}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {categoryDocuments.length}건
                      </Badge>
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
                        {categoryDocuments.map((document) => (
                          <TableRow key={document.id}>
                            <TableCell className="text-xs font-mono">
                              {document.doc_number}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {docTypeLabels[document.doc_type] ||
                                  document.doc_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {document.title}
                            </TableCell>
                            <TableCell className="text-xs">
                              {document.version || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {document.review_status
                                  ? reviewStatusLabels[document.review_status] ||
                                    document.review_status
                                  : "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {document.created_at
                                ? new Date(document.created_at).toLocaleDateString(
                                    "ko-KR",
                                  )
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              ),
            )}
          </Accordion>
        )}
      </div>

      <Dialog
        open={showUpload}
        onOpenChange={(open) => {
          setShowUpload(open);
          if (!open) setForm({});
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>도면 업로드</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>공사 프로젝트 *</Label>
              <Select
                value={form.project_id || ""}
                onValueChange={(value) => updateForm("project_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.project_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>도면유형 *</Label>
              <Select
                value={form.doc_type || ""}
                onValueChange={(value) => updateForm("doc_type", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(docTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>카테고리</Label>
              <Select
                value={form.category || ""}
                onValueChange={(value) => updateForm("category", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(docCategoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>제목 *</Label>
              <Input
                value={form.title || ""}
                onChange={(event) => updateForm("title", event.target.value)}
              />
            </div>
            <div>
              <Label>버전</Label>
              <Input
                value={form.version || "v1.0"}
                onChange={(event) => updateForm("version", event.target.value)}
              />
            </div>
            <div>
              <Label>버전 메모</Label>
              <Textarea
                value={form.version_note || ""}
                onChange={(event) =>
                  updateForm("version_note", event.target.value)
                }
              />
            </div>
            <AuthorField
              value={form.author_name || ""}
              onChange={(value) => updateForm("author_name", value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>
              취소
            </Button>
            <Button onClick={handleUpload}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
