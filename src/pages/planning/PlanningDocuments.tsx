import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  FileText,
  LoaderCircle,
  Pencil,
  Upload,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthorField } from "@/components/common/AuthorField";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getSecureUploadPath, validateUploadFile } from "@/lib/file-security";
import { logActivity } from "@/lib/activity-logger";
import {
  DOC_CATEGORY_LABELS,
  DOC_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  type DesignDocument,
} from "@/types/planning";

const STORAGE_BUCKET = "official-documents";
const ACCEPTED_FILE_TYPES = ".pdf,.hwp,.docx,.xlsx,.pptx";
const EDITOR_STATUSES = ["draft", "submitted", "reviewing", "revision_required"];
const MANAGER_STATUSES = [...EDITOR_STATUSES, "approved", "final"];
const PROTECTED_STATUSES = new Set(["approved", "final"]);

type ProjectOption = {
  id: string;
  project_number: string;
  project_name: string;
};

type DocumentForm = {
  project_id: string;
  doc_type: string;
  category: string;
  title: string;
  description: string;
  version: string;
  version_note: string;
  review_status: string;
  review_comments: string;
  author_name: string;
};

const emptyForm: DocumentForm = {
  project_id: "",
  doc_type: "",
  category: "",
  title: "",
  description: "",
  version: "v1.0",
  version_note: "",
  review_status: "draft",
  review_comments: "",
  author_name: "",
};

function parseStoragePath(filePath: string) {
  const match = filePath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  return match ? { bucket: match[1], path: match[2] } : null;
}

function formatFileSize(size?: number) {
  if (!size) return "-";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.ceil(size / 1024).toLocaleString("ko-KR")}KB`;
}

function createDocumentNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toTimeString().slice(0, 8).replaceAll(":", "");
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `DD-${date}-${time}-${suffix}`;
}

export default function PlanningDocuments() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("__all__");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingDocument, setEditingDocument] = useState<DesignDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DesignDocument | null>(null);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const canEdit = Boolean(profile?.role && ["admin", "manager", "editor"].includes(profile.role));
  const canManage = Boolean(profile?.role && ["admin", "manager"].includes(profile.role));
  const availableStatuses = canManage ? MANAGER_STATUSES : EDITOR_STATUSES;

  const { data: projects = [] } = useQuery({
    queryKey: ["planning-projects-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("id, project_number, project_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProjectOption[];
    },
  });

  const {
    data: documents = [],
    isLoading,
    error: documentsError,
  } = useQuery({
    queryKey: ["planning-docs", selectedProject],
    queryFn: async () => {
      let query = supabase
        .from("design_documents")
        .select("*")
        .eq("is_current", true);
      if (selectedProject !== "__all__") query = query.eq("project_id", selectedProject);
      const { data, error } = await query
        .order("category")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DesignDocument[];
    },
  });

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.project_name])),
    [projects],
  );

  const closeDialog = () => {
    setDialogMode(null);
    setEditingDocument(null);
    setForm(emptyForm);
    setFile(null);
    setFormError("");
  };

  const openCreateDialog = () => {
    setForm({
      ...emptyForm,
      project_id: selectedProject === "__all__" ? "" : selectedProject,
      author_name: profile?.name || "",
    });
    setFile(null);
    setFormError("");
    setDialogMode("create");
  };

  const openEditDialog = (document: DesignDocument) => {
    setEditingDocument(document);
    setForm({
      project_id: document.project_id,
      doc_type: document.doc_type,
      category: document.category || "",
      title: document.title,
      description: document.description || "",
      version: document.version,
      version_note: document.version_note || "",
      review_status: document.review_status,
      review_comments: document.review_comments || "",
      author_name: (document as DesignDocument & { author_name?: string }).author_name || "",
    });
    setFile(null);
    setFormError("");
    setDialogMode("edit");
  };

  const updateForm = <K extends keyof DocumentForm>(key: K, value: DocumentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const refreshDocuments = () =>
    queryClient.invalidateQueries({ queryKey: ["planning-docs"] });

  const handleSave = async () => {
    const actorId = user?.id || profile?.id;
    if (!actorId) {
      setFormError("사용자 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
      return;
    }
    if (!form.project_id || !form.doc_type || !form.title.trim()) {
      setFormError("공사 프로젝트, 도면 유형, 제목은 필수입니다.");
      return;
    }
    if (dialogMode === "create" && !file) {
      setFormError("등록할 원문 파일을 선택해 주세요.");
      return;
    }
    if (!availableStatuses.includes(form.review_status)) {
      setFormError("현재 권한으로 변경할 수 없는 검토 상태입니다.");
      return;
    }

    setSaving(true);
    setFormError("");
    let uploadedPath = "";
    let uploadedBucket = STORAGE_BUCKET;
    try {
      if (dialogMode === "create" && file) {
        const validation = await validateUploadFile(file, "document");
        if (!validation.isValid) throw new Error(validation.errors.join(" "));
        uploadedPath = `${actorId}/planning/${form.project_id}/${getSecureUploadPath("design", file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(uploadedBucket)
          .upload(uploadedPath, file, {
            cacheControl: "3600",
            contentType: file.type || undefined,
            upsert: false,
          });
        if (uploadError) {
          const canUsePrivateDevFallback =
            import.meta.env.DEV &&
            /bucket not found/i.test(uploadError.message) &&
            [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ].includes(file.type);
          if (!canUsePrivateDevFallback) throw uploadError;
          uploadedBucket = "reports";
          const { error: fallbackError } = await supabase.storage
            .from(uploadedBucket)
            .upload(uploadedPath, file, {
              cacheControl: "3600",
              contentType: file.type || undefined,
              upsert: false,
            });
          if (fallbackError) throw fallbackError;
        }

        const { error: insertError } = await supabase.from("design_documents").insert({
          project_id: form.project_id,
          doc_number: createDocumentNumber(),
          doc_type: form.doc_type,
          title: form.title.trim(),
          description: form.description.trim() || null,
          file_path: `${uploadedBucket}://${uploadedPath}`,
          file_format: file.name.split(".").pop()?.toLowerCase() || null,
          file_size: file.size,
          version: form.version.trim() || "v1.0",
          version_note: form.version_note.trim() || null,
          review_status: form.review_status,
          review_comments: form.review_comments.trim() || null,
          category: form.category || null,
          uploaded_by: actorId,
          author_name: form.author_name.trim() || null,
          is_current: true,
        } as never);
        if (insertError) throw insertError;

        await logActivity({
          module: "PLANNING",
          action: "document_uploaded",
          targetType: "design_document",
          targetName: form.title.trim(),
          details: {
            file_name: file.name,
            file_size: file.size,
            review_status: form.review_status,
          },
        });
        toast({ title: "도면 원문을 등록했습니다." });
      } else if (dialogMode === "edit" && editingDocument) {
        const statusChanged = editingDocument.review_status !== form.review_status;
        const actorFields = statusChanged
          ? form.review_status === "approved" || form.review_status === "final"
            ? { approved_by: actorId, approved_at: new Date().toISOString() }
            : { reviewed_by: actorId, reviewed_at: new Date().toISOString() }
          : {};
        const { error: updateError } = await supabase
          .from("design_documents")
          .update({
            doc_type: form.doc_type,
            title: form.title.trim(),
            description: form.description.trim() || null,
            version: form.version.trim() || "v1.0",
            version_note: form.version_note.trim() || null,
            review_status: form.review_status,
            review_comments: form.review_comments.trim() || null,
            category: form.category || null,
            author_name: form.author_name.trim() || null,
            ...actorFields,
          } as never)
          .eq("id", editingDocument.id);
        if (updateError) throw updateError;

        await logActivity({
          module: "PLANNING",
          action: statusChanged ? "document_status_changed" : "document_updated",
          targetType: "design_document",
          targetId: editingDocument.id,
          targetName: form.title.trim(),
          details: {
            previous_status: editingDocument.review_status,
            review_status: form.review_status,
          },
        });
        toast({ title: "도면 정보를 수정했습니다." });
      }

      closeDialog();
      await refreshDocuments();
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from(uploadedBucket).remove([uploadedPath]);
      }
      const message = error instanceof Error ? error.message : "도면 저장에 실패했습니다.";
      setFormError(message);
      toast({ title: "도면 저장 실패", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFile = async (document: DesignDocument) => {
    const storagePath = parseStoragePath(document.file_path);
    if (!storagePath) {
      toast({
        title: "원문 파일 경로가 올바르지 않습니다.",
        description: "기존 가상 경로 문서는 새 원문 파일로 다시 등록해 주세요.",
        variant: "destructive",
      });
      return;
    }

    const fileWindow = window.open("", "_blank");
    setOpeningId(document.id);
    try {
      const { data, error } = await supabase.storage
        .from(storagePath.bucket)
        .createSignedUrl(storagePath.path, 60);
      if (error) throw error;
      if (fileWindow) {
        fileWindow.opener = null;
        fileWindow.location.href = data.signedUrl;
      } else {
        window.location.href = data.signedUrl;
      }
    } catch (error) {
      fileWindow?.close();
      toast({
        title: "원문 파일을 열 수 없습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete || !canManage) return;
    if (PROTECTED_STATUSES.has(pendingDelete.review_status)) {
      toast({
        title: "승인 또는 최종 문서는 삭제할 수 없습니다.",
        description: "검토 상태를 변경하고 삭제 사유를 확인한 뒤 처리해 주세요.",
        variant: "destructive",
      });
      setPendingDelete(null);
      return;
    }

    const document = pendingDelete;
    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from("design_documents")
        .delete()
        .eq("id", document.id);
      if (deleteError) throw deleteError;

      const storagePath = parseStoragePath(document.file_path);
      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from(storagePath.bucket)
          .remove([storagePath.path]);
        if (storageError) {
          toast({
            title: "문서 기록은 삭제했지만 저장소 정리가 필요합니다.",
            description: storageError.message,
            variant: "destructive",
          });
        }
      }

      await logActivity({
        module: "PLANNING",
        action: "document_deleted",
        targetType: "design_document",
        targetId: document.id,
        targetName: document.title,
        details: { document_number: document.doc_number },
      });
      toast({ title: "도면과 원문 파일을 삭제했습니다." });
      await refreshDocuments();
    } catch (error) {
      toast({
        title: "도면 삭제 실패",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPendingDelete(null);
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">도면 관리</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              설계도면 원문, 버전과 검토 상태를 함께 관리합니다.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openCreateDialog}>
              <Upload className="mr-1.5 h-4 w-4" />
              도면 등록
            </Button>
          )}
        </div>

        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-full sm:w-[360px]">
            <SelectValue placeholder="공사 프로젝트 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체 프로젝트</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                [{project.project_number}] {project.project_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-16 w-full" />
            ))}
          </div>
        ) : documentsError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium text-destructive">도면 목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {documentsError instanceof Error ? documentsError.message : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button className="mt-4" variant="outline" onClick={() => void refreshDocuments()}>
                다시 불러오기
              </Button>
            </CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>등록된 도면이 없습니다.</p>
              {canEdit && (
                <Button className="mt-4" variant="outline" onClick={openCreateDialog}>
                  첫 도면 등록
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>문서번호</TableHead>
                    <TableHead>프로젝트</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>버전</TableHead>
                    <TableHead>원문</TableHead>
                    <TableHead>검토상태</TableHead>
                    <TableHead>등록일</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => {
                    const hasStoredFile = Boolean(parseStoragePath(document.file_path));
                    return (
                      <TableRow key={document.id}>
                        <TableCell className="font-mono text-xs">{document.doc_number}</TableCell>
                        <TableCell className="max-w-48 truncate text-sm">
                          {projectNames.get(document.project_id) || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {DOC_TYPE_LABELS[document.doc_type] || document.doc_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-64 truncate font-medium">
                          {document.title}
                        </TableCell>
                        <TableCell>{document.version}</TableCell>
                        <TableCell className="text-sm">
                          <div>{document.file_format?.toUpperCase() || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(document.file_size)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {REVIEW_STATUS_LABELS[document.review_status] || document.review_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {document.created_at
                            ? new Date(document.created_at).toLocaleDateString("ko-KR")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title={hasStoredFile ? "원문 열기" : "원문 파일 없음"}
                              disabled={!hasStoredFile || openingId === document.id}
                              onClick={() => void handleOpenFile(document)}
                            >
                              {openingId === document.id ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="도면 정보 수정"
                                onClick={() => openEditDialog(document)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title={
                                  PROTECTED_STATUSES.has(document.review_status)
                                    ? "승인·최종 문서는 삭제할 수 없음"
                                    : "도면 삭제"
                                }
                                disabled={PROTECTED_STATUSES.has(document.review_status)}
                                onClick={() => setPendingDelete(document)}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "도면 원문 등록" : "도면 정보 수정"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="planning-project">공사 프로젝트 *</Label>
              <Select
                value={form.project_id}
                disabled={dialogMode === "edit"}
                onValueChange={(value) => updateForm("project_id", value)}
              >
                <SelectTrigger id="planning-project">
                  <SelectValue placeholder="프로젝트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      [{project.project_number}] {project.project_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="planning-doc-type">도면 유형 *</Label>
                <Select value={form.doc_type} onValueChange={(value) => updateForm("doc_type", value)}>
                  <SelectTrigger id="planning-doc-type">
                    <SelectValue placeholder="유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planning-category">분야</Label>
                <Select value={form.category} onValueChange={(value) => updateForm("category", value)}>
                  <SelectTrigger id="planning-category">
                    <SelectValue placeholder="분야 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planning-title">제목 *</Label>
              <Input
                id="planning-title"
                value={form.title}
                maxLength={200}
                onChange={(event) => updateForm("title", event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planning-description">설명</Label>
              <Textarea
                id="planning-description"
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
              />
            </div>

            {dialogMode === "create" ? (
              <div className="space-y-1.5">
                <Label htmlFor="planning-file">원문 파일 *</Label>
                <Input
                  id="planning-file"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground">
                  PDF, HWP, DOCX, XLSX, PPTX 형식, 최대 20MB
                </p>
                {file && (
                  <p className="text-sm">
                    {file.name} · {formatFileSize(file.size)}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                원문 파일은 기록 보존을 위해 수정할 수 없습니다. 변경본은 새 버전으로 등록해 주세요.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="planning-version">버전</Label>
                <Input
                  id="planning-version"
                  value={form.version}
                  maxLength={20}
                  onChange={(event) => updateForm("version", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planning-status">검토 상태</Label>
                <Select
                  value={form.review_status}
                  onValueChange={(value) => updateForm("review_status", value)}
                >
                  <SelectTrigger id="planning-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {REVIEW_STATUS_LABELS[status] || status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planning-version-note">버전 메모</Label>
              <Textarea
                id="planning-version-note"
                value={form.version_note}
                onChange={(event) => updateForm("version_note", event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planning-review-comments">검토 의견</Label>
              <Textarea
                id="planning-review-comments"
                value={form.review_comments}
                onChange={(event) => updateForm("review_comments", event.target.value)}
              />
            </div>

            <AuthorField
              value={form.author_name}
              onChange={(value) => updateForm("author_name", value)}
            />

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              취소
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
              {dialogMode === "create" ? "원문 등록" : "수정 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>도면을 영구 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.doc_number} {pendingDelete?.title}의 문서 기록과 원문 파일이 함께 삭제됩니다.
              승인 또는 최종 문서는 삭제할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
