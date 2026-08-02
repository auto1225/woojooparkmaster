import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createOfficialDocument, updateOfficialDocument, uploadOfficialDocumentFiles } from "@/lib/official-document-registry";
import type { DocumentDirection, DocumentStatus, OfficialDocument } from "@/types/official-document";
import { toast } from "sonner";
import { PRIMARY_DEPARTMENT, PRIMARY_ORGANIZATION } from "@/config/organization";
import { FileText, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (document: OfficialDocument) => Promise<void> | void;
  initialTitle?: string;
  initialDocumentNumber?: string;
  document?: OfficialDocument | null;
}

const now = new Date();
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const EMPTY_FORM = {
  documentNumber: "",
  title: "",
  direction: "outgoing" as DocumentDirection,
  documentType: "공문",
  documentDate: today,
  senderOrganization: PRIMARY_ORGANIZATION,
  receiverOrganization: "",
  department: PRIMARY_DEPARTMENT,
  securityLevel: "일반",
  status: "registered" as DocumentStatus,
  retentionPeriod: "5년",
  notes: "",
};

export function OfficialDocumentDialog({ open, onOpenChange, onCreated, initialTitle = "", initialDocumentNumber = "", document = null }: Props) {
  const [form, setForm] = useState({ ...EMPTY_FORM, title: initialTitle, documentNumber: initialDocumentNumber });
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(document ? {
      documentNumber: document.documentNumber,
      title: document.title,
      direction: document.direction,
      documentType: document.documentType,
      documentDate: document.documentDate || "",
      senderOrganization: document.senderOrganization || "",
      receiverOrganization: document.receiverOrganization || "",
      department: document.department || "",
      securityLevel: document.securityLevel,
      status: document.status,
      retentionPeriod: document.retentionPeriod || "",
      notes: document.notes || "",
    } : { ...EMPTY_FORM, title: initialTitle, documentNumber: initialDocumentNumber });
    setFiles([]);
  }, [open, initialTitle, initialDocumentNumber, document]);

  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSaving(true);
    let saved: OfficialDocument | null = null;
    try {
      saved = document ? await updateOfficialDocument(document.id, form) : await createOfficialDocument(form);
      if (files.length) await uploadOfficialDocumentFiles(saved, files);
      await onCreated(saved);
      toast.success(document ? "문서 정보를 수정했습니다." : "문서와 원문 파일을 등록했습니다.", { description: saved.documentNumber });
      onOpenChange(false);
    } catch (error: any) {
      if (!document && saved) {
        await onCreated(saved);
        toast.error("문서는 등록됐지만 원문 파일 등록에 실패했습니다.", { description: `${saved.documentNumber} · ${error.message}` });
        onOpenChange(false);
        return;
      }
      toast.error(document ? "문서 수정에 실패했습니다." : "문서 등록에 실패했습니다.", { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{document ? "공식 문서 수정" : "공식 문서 등록"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="official-document-number">문서번호 *</Label>
            <Input id="official-document-number" value={form.documentNumber} onChange={(event) => update("documentNumber", event.target.value)} placeholder="제주시청-차량관리과운영팀-2026-0142" />
          </div>
          <div className="space-y-1.5">
            <Label>문서 구분</Label>
            <Select value={form.direction} onValueChange={(value) => update("direction", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outgoing">발신</SelectItem>
                <SelectItem value="incoming">수신</SelectItem>
                <SelectItem value="internal">내부</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="official-document-title">제목 *</Label>
            <Input id="official-document-title" value={form.title} onChange={(event) => update("title", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-document-type">문서 종류</Label>
            <Input id="official-document-type" value={form.documentType} onChange={(event) => update("documentType", event.target.value)} placeholder="공문, 보고서, 회신" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-document-date">시행·접수일</Label>
            <Input id="official-document-date" type="date" value={form.documentDate} onChange={(event) => update("documentDate", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-document-department">담당 부서</Label>
            <Input id="official-document-department" value={form.department} onChange={(event) => update("department", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-document-retention">보존 기간</Label>
            <Input id="official-document-retention" value={form.retentionPeriod} onChange={(event) => update("retentionPeriod", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>처리 상태</Label>
            <Select value={form.status} onValueChange={(value) => update("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="draft">작성중</SelectItem><SelectItem value="registered">등록</SelectItem><SelectItem value="sent">발송</SelectItem><SelectItem value="received">접수</SelectItem><SelectItem value="archived">보존</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>보안 등급</Label>
            <Select value={form.securityLevel} onValueChange={(value) => update("securityLevel", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="일반">일반</SelectItem><SelectItem value="대외주의">대외주의</SelectItem><SelectItem value="비공개">비공개</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-document-sender">발신 기관</Label>
            <Input id="official-document-sender" value={form.senderOrganization} onChange={(event) => update("senderOrganization", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="official-document-receiver">수신 기관</Label>
            <Input id="official-document-receiver" value={form.receiverOrganization} onChange={(event) => update("receiverOrganization", event.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="official-document-notes">비고</Label>
            <Textarea id="official-document-notes" rows={3} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="official-document-files">원문 파일</Label>
            <label htmlFor="official-document-files" className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"><Upload className="h-4 w-4" />PDF·HWP·DOCX·XLSX·PPTX 파일 선택</label>
            <Input id="official-document-files" className="sr-only" type="file" multiple accept=".pdf,.hwp,.docx,.xlsx,.pptx" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            {files.length > 0 && <ul className="divide-y rounded-md border px-3">{files.map((file) => <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 py-2 text-sm"><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)}MB</span></li>)}</ul>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={submit} disabled={saving || !form.documentNumber.trim() || !form.title.trim()}>{saving ? "저장 중..." : document ? "수정 저장" : "문서 등록"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
