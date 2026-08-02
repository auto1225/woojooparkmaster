import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OfficialDocumentDialog } from "@/components/documents/OfficialDocumentDialog";
import { LinkDocumentDialog } from "@/components/documents/LinkDocumentDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  changeDocumentLinkRelation,
  DOCUMENT_RELATION_LABELS,
  linkOfficialDocument,
  listRecordDocuments,
  unlinkOfficialDocument,
} from "@/lib/official-document-registry";
import type { DocumentRelationType, OfficialDocument } from "@/types/official-document";
import { toast } from "sonner";

interface Props {
  module: string;
  recordId: string;
  recordPath: string;
  recordTitle?: string;
  initialDocumentNumber?: string;
  onLinked?: (document: OfficialDocument) => Promise<void> | void;
}

export function DocumentLinksPanel({ module, recordId, recordPath, recordTitle, initialDocumentNumber, onLinked }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [relationType, setRelationType] = useState<DocumentRelationType>("reference");
  const queryKey = ["official-documents", module, recordId];
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => listRecordDocuments(module, recordId),
  });

  const handleCreated = async (document: OfficialDocument) => {
    await linkOfficialDocument({ document, module, recordId, relationType, recordPath, recordLabel: recordTitle });
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["official-document-list"] });
    await onLinked?.(document);
  };

  const changeRelation = async (link: (typeof data)[number]["link"], value: DocumentRelationType) => {
    try {
      await changeDocumentLinkRelation(link, value);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["official-document-links", link.documentId] });
      toast.success("문서 관계를 변경했습니다.");
    } catch (error: any) {
      toast.error("문서 관계 변경에 실패했습니다.", { description: error.message });
    }
  };

  const remove = async (linkId: string) => {
    try {
      await unlinkOfficialDocument(linkId);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("문서 연결을 해제했습니다.");
    } catch (error: any) {
      toast.error("연결 해제에 실패했습니다.", { description: error.message });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 whitespace-nowrap text-sm"><Link2 className="h-4 w-4" />관련 공식 문서</CardTitle>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex">
          <Select value={relationType} onValueChange={(value) => setRelationType(value as DocumentRelationType)}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_RELATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setDialogOpen(true)}><Link2 className="h-3.5 w-3.5" />기존 문서</Button>
          <Button size="sm" className="h-8 gap-1" onClick={() => setCreateDialogOpen(true)}><Plus className="h-3.5 w-3.5" />문서 등록</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">불러오는 중...</p> : isError ? (
          <div className="py-4 text-center"><p className="text-sm text-destructive">문서 연결을 불러오지 못했습니다.</p><Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>다시 시도</Button></div>
        ) : data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">연결된 공식 문서가 없습니다.</p>
        ) : (
          <div className="divide-y">
            {data.map(({ document, link }) => (
              <div key={link.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2.5 sm:flex sm:gap-3">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/documents/${document.id}`)}>
                  <p className="truncate text-sm font-medium">{document.documentNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">{document.title}</p>
                </button>
                <Select value={link.relationType} onValueChange={(value) => changeRelation(link, value as DocumentRelationType)}>
                  <SelectTrigger className="col-start-2 h-8 w-full text-xs sm:w-28" aria-label="문서 관계 변경"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DOCUMENT_RELATION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="연결 해제" onClick={() => setPendingDelete(link.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <LinkDocumentDialog open={dialogOpen} onOpenChange={setDialogOpen} onSelect={handleCreated} onCreateNew={() => setCreateDialogOpen(true)} excludedIds={data.map(({ document }) => document.id)} />
      <OfficialDocumentDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onCreated={handleCreated} initialTitle={recordTitle ? `${recordTitle} 관련 문서` : ""} initialDocumentNumber={initialDocumentNumber} />
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>문서 연결을 해제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>문서 자체는 삭제되지 않으며 이 업무자료와의 연결만 해제됩니다.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDelete) void remove(pendingDelete); setPendingDelete(null); }}>연결 해제</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
