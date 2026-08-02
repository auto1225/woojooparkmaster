import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Clock3, Download, ExternalLink, FileText, Paperclip, Pencil, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OfficialDocumentDialog } from "@/components/documents/OfficialDocumentDialog";
import { changeDocumentLinkRelation, deleteOfficialDocumentFile, DOCUMENT_MODULE_LABELS, DOCUMENT_RELATION_LABELS, getOfficialDocument, getOfficialDocumentFileUrl, listDocumentActivity, listDocumentLinks, listOfficialDocumentFiles } from "@/lib/official-document-registry";
import type { DocumentRelationType, OfficialDocument, OfficialDocumentFile } from "@/types/official-document";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DIRECTION_LABELS = { outgoing: "발신", incoming: "수신", internal: "내부" };

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteFile, setDeleteFile] = useState<OfficialDocumentFile | null>(null);
  const canManage = ["admin", "manager", "editor"].includes(profile?.role || "");
  const { data: document, isLoading } = useQuery({ queryKey: ["official-document", id], queryFn: () => getOfficialDocument(id!), enabled: !!id });
  const { data: links = [] } = useQuery({ queryKey: ["official-document-links", id], queryFn: () => listDocumentLinks(id!), enabled: !!id });
  const { data: activity = [] } = useQuery({ queryKey: ["official-document-activity", id], queryFn: () => listDocumentActivity(id!), enabled: !!id });
  const { data: files = [] } = useQuery({ queryKey: ["official-document-files", id], queryFn: () => listOfficialDocumentFiles(id!), enabled: !!id });

  if (isLoading) return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  if (!document) return <DashboardLayout><p>문서를 찾을 수 없습니다.</p></DashboardLayout>;

  const fields = [
    ["문서 구분", DIRECTION_LABELS[document.direction]], ["문서 종류", document.documentType], ["시행·접수일", document.documentDate || "-"],
    ["담당 부서", document.department || "-"], ["발신 기관", document.senderOrganization || "-"], ["수신 기관", document.receiverOrganization || "-"],
    ["보안 등급", document.securityLevel], ["보존 기간", document.retentionPeriod || "-"],
  ];

  const handleUpdated = async (_updated: OfficialDocument) => {
    await queryClient.invalidateQueries({ queryKey: ["official-document", id] });
    await queryClient.invalidateQueries({ queryKey: ["official-document-list"] });
    await queryClient.invalidateQueries({ queryKey: ["official-document-activity", id] });
  };

  const changeRelation = async (link: (typeof links)[number], relationType: DocumentRelationType) => {
    try {
      await changeDocumentLinkRelation(link, relationType);
      await queryClient.invalidateQueries({ queryKey: ["official-document-links", id] });
      await queryClient.invalidateQueries({ queryKey: ["official-document-activity", id] });
      toast.success("문서 관계를 변경했습니다.");
    } catch (error: any) {
      toast.error("문서 관계 변경에 실패했습니다.", { description: error.message });
    }
  };

  const openFile = async (file: OfficialDocumentFile) => {
    try {
      const url = await getOfficialDocumentFileUrl(file.filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast.error("원문 파일을 열지 못했습니다.", { description: error.message });
    }
  };

  const removeFile = async () => {
    if (!deleteFile) return;
    try {
      await deleteOfficialDocumentFile(deleteFile);
      await queryClient.invalidateQueries({ queryKey: ["official-document-files", id] });
      await queryClient.invalidateQueries({ queryKey: ["official-document-activity", id] });
      toast.success("원문 파일을 삭제했습니다.");
    } catch (error: any) {
      toast.error("원문 파일 삭제에 실패했습니다.", { description: error.message });
    } finally {
      setDeleteFile(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documents")}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-xl font-bold">{document.documentNumber}</h1><Badge variant="outline">{document.status === "draft" ? "작성중" : document.status === "sent" ? "발송" : document.status === "received" ? "접수" : document.status === "archived" ? "보존" : "등록"}</Badge></div><p className="truncate text-sm text-muted-foreground">{document.title}</p></div>
          {canManage && <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1.5 h-4 w-4" />문서 수정</Button>}
        </div>
        {files.length === 0 && document.status !== "draft" && (
          <div role="alert" className="flex flex-col gap-3 border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">원문 파일 미등록</p>
              <p className="mt-0.5 text-xs">문서번호와 업무 연결은 조회되지만 실제 공문 원문을 확인할 수 없습니다.</p>
            </div>
            {canManage && <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={() => setEditOpen(true)}>원문 추가</Button>}
          </div>
        )}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />문서 정보</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {fields.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}
            </dl>
            {document.notes && <div className="mt-5 border-t pt-4"><p className="text-xs text-muted-foreground">비고</p><p className="mt-1 whitespace-pre-wrap text-sm">{document.notes}</p></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4" />원문 파일 <Badge variant="secondary">{files.length}</Badge></CardTitle></CardHeader>
          <CardContent>{files.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">등록된 원문 파일이 없습니다. 문서 수정에서 파일을 추가할 수 있습니다.</p> : <div className="divide-y">{files.map((file) => <div key={file.id} className="flex items-center gap-3 py-3"><FileText className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.fileName}</p><p className="text-xs text-muted-foreground">{(file.fileSize / 1024 / 1024).toFixed(1)}MB</p></div><Button size="icon" variant="ghost" title="원문 열기" onClick={() => openFile(file)}><Download className="h-4 w-4" /></Button>{profile?.role === "admin" && <Button size="icon" variant="ghost" className="text-destructive" title="원문 삭제" onClick={() => setDeleteFile(file)}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">연결 업무자료 <Badge variant="secondary" className="ml-1">{links.length}</Badge></CardTitle></CardHeader>
          <CardContent>
            {links.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">연결된 업무자료가 없습니다.</p> : (
              <div className="divide-y">
                {links.map((link) => <div key={link.id} className="flex items-center gap-3 py-3">
                  <Badge variant="outline">{DOCUMENT_MODULE_LABELS[link.module] || link.module}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm" title={link.recordId}>{link.recordLabel || link.recordId}</span>
                  <Select value={link.relationType} onValueChange={(value) => changeRelation(link, value as DocumentRelationType)}>
                    <SelectTrigger className="h-8 w-28 text-xs" aria-label="문서 관계 변경"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(DOCUMENT_RELATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                  {link.recordPath && <Button variant="ghost" size="icon" title="업무자료 열기" onClick={() => navigate(link.recordPath!)}><ExternalLink className="h-4 w-4" /></Button>}
                </div>)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4" />변경 이력 <Badge variant="secondary">{activity.length}</Badge></CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">기록된 변경 이력이 없습니다.</p> : (
              <ol className="divide-y">
                {activity.map((item) => <li key={item.id} className="flex items-start gap-3 py-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.action}</p><p className="text-xs text-muted-foreground">{item.userName || "시스템"}</p></div>
                  <time className="shrink-0 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("ko-KR")}</time>
                </li>)}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <OfficialDocumentDialog open={editOpen} onOpenChange={setEditOpen} onCreated={handleUpdated} document={document} />
      <AlertDialog open={Boolean(deleteFile)} onOpenChange={(open) => !open && setDeleteFile(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>원문 파일을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>{deleteFile?.fileName} 파일은 복구할 수 없습니다. 문서대장과 업무 연결은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={removeFile}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </DashboardLayout>
  );
}
