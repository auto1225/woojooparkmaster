import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, ChevronRight, ClipboardPlus, Eye, FileText, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getWorkflowTransitionError, type DomainWorkflowConfig, type DomainWorkflowField } from "@/config/domain-workflows";
import { archiveTeamWorkRecord, createTeamWorkRecord, isTeamWorkOverdue, listTeamWorkRecords, updateTeamWorkRecord, updateTeamWorkStatus } from "@/lib/team-work-registry";
import type { TeamWorkInput, TeamWorkRecord, TeamWorkStatus } from "@/types/team-work";

function stageIndex(config: DomainWorkflowConfig, status: TeamWorkStatus) {
  return config.stages.findIndex((stage) => stage.status === status);
}

function stageLabel(config: DomainWorkflowConfig, status: TeamWorkStatus) {
  return config.stages.find((stage) => stage.status === status)?.label || status;
}

function valueToString(value: TeamWorkRecord["payload"][string]) {
  return value == null ? "" : String(value);
}

function initialForm(config: DomainWorkflowConfig, record?: TeamWorkRecord | null) {
  if (!record) {
    return Object.fromEntries([
      ["title", ""], ["parkingLot", ""], ["ownerName", ""], ["dueDate", ""], ["documentNumber", ""],
      ...config.fields.map((field) => [field.key, field.options?.[0] || ""]),
    ]);
  }
  return Object.fromEntries([
    ["title", record.title], ["parkingLot", record.parkingLot || ""], ["ownerName", record.ownerName || ""], ["dueDate", record.dueDate || ""], ["documentNumber", record.documentNumber || ""],
    ...config.fields.map((field) => [field.key, valueToString(record.payload[field.key])]),
  ]);
}

function WorkflowField({ field, value, onChange }: { field: DomainWorkflowField; value: string; onChange: (value: string) => void }) {
  if (field.type === "textarea") return <Textarea id={`workflow-${field.key}`} value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (field.type === "select") return <Select value={value || field.options?.[0]} onValueChange={onChange}><SelectTrigger id={`workflow-${field.key}`}><SelectValue /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
  return <Input id={`workflow-${field.key}`} type={field.type || "text"} min={field.type === "number" ? 0 : undefined} value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
}

function RecordDialog({ config, open, record, onOpenChange }: { config: DomainWorkflowConfig; open: boolean; record: TeamWorkRecord | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(() => initialForm(config, record));
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const requiredMissing = !form.title?.trim() || !form.parkingLot?.trim() || config.fields.some((field) => field.required && !form[field.key]?.trim());
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(config.fields.map((field) => [field.key, field.type === "number" ? Number(form[field.key] || 0) : form[field.key] || null]));
      const input: TeamWorkInput = {
        recordType: config.recordType,
        team: config.team,
        title: form.title.trim(),
        category: config.category,
        parkingLot: form.parkingLot.trim(),
        ownerName: form.ownerName.trim(),
        dueDate: form.dueDate,
        documentNumber: form.documentNumber.trim(),
        priority: record?.priority || "normal",
        status: record?.status || "registered",
        amount: config.key === "capital_procedure" ? Number(form.budget || 0) : record?.amount || 0,
        payload: { workflow_key: config.key, ...payload },
      };
      return record ? updateTeamWorkRecord(record, input) : createTeamWorkRecord(input);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["domain-workflow", config.key] });
      toast.success(`${saved.recordNumber} ${record ? "수정" : "등록"} 완료`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{config.itemLabel} {record ? "수정" : "등록"}</DialogTitle><DialogDescription>담당자·기한·문서번호와 단계별 처리 근거를 함께 저장합니다.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="workflow-title">{config.itemLabel}명 *</Label><Input id="workflow-title" value={form.title} onChange={(event) => set("title", event.target.value)} /></div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="workflow-location">{config.locationLabel} *</Label><Input id="workflow-location" value={form.parkingLot} onChange={(event) => set("parkingLot", event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="workflow-owner">담당자</Label><Input id="workflow-owner" value={form.ownerName} placeholder="담당자 또는 담당 연락처" onChange={(event) => set("ownerName", event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="workflow-due">처리기한</Label><Input id="workflow-due" type="date" value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="workflow-document">관련 문서번호</Label><Input id="workflow-document" placeholder="제주시청-차량관리과운영팀-2026-0142" value={form.documentNumber} onChange={(event) => set("documentNumber", event.target.value)} /></div>
    {config.fields.map((field) => <div key={field.key} className={`space-y-2 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}><Label htmlFor={`workflow-${field.key}`}>{field.label}{field.required ? " *" : ""}</Label><WorkflowField field={field} value={form[field.key] || ""} onChange={(value) => set(field.key, value)} /></div>)}
  </div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={requiredMissing || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "저장 중..." : "저장"}</Button></DialogFooter></DialogContent></Dialog>;
}

function DetailDialog({ config, record, onClose, onEdit, onArchive, onDocumentLinked }: { config: DomainWorkflowConfig; record: TeamWorkRecord; onClose: () => void; onEdit: () => void; onArchive: () => void; onDocumentLinked: (documentNumber: string) => Promise<void> }) {
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{record.title}</DialogTitle><DialogDescription>{record.recordNumber} · {stageLabel(config, record.status)}</DialogDescription></DialogHeader><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
    {[[config.locationLabel, record.parkingLot || "-"], ["담당자", record.ownerName || "미지정"], ["처리기한", record.dueDate || "-"], ["문서번호", record.documentNumber || "-"]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}
    {config.fields.map((field) => <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-medium">{valueToString(record.payload[field.key]) || "-"}</dd></div>)}
  </dl><DocumentLinksPanel module={config.module} recordId={record.id} recordPath={config.path} recordTitle={record.title} initialDocumentNumber={record.documentNumber || ""} onLinked={(document) => onDocumentLinked(document.documentNumber)} /><DialogFooter className="gap-2"><Button variant="outline" className="text-destructive" onClick={onArchive}><Archive className="mr-1.5 h-4 w-4" />보관</Button><Button variant="outline" onClick={onEdit}><Pencil className="mr-1.5 h-4 w-4" />수정</Button><Button onClick={onClose}>확인</Button></DialogFooter></DialogContent></Dialog>;
}

export function DomainWorkflowPage({ config }: { config: DomainWorkflowConfig }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamWorkRecord | null>(null);
  const [detail, setDetail] = useState<TeamWorkRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TeamWorkRecord | null>(null);
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ["domain-workflow", config.key], queryFn: async () => (await listTeamWorkRecords(config.recordType)).filter((record) => record.payload.workflow_key === config.key) });
  const filtered = useMemo(() => data.filter((record) => `${record.recordNumber} ${record.title} ${record.parkingLot || ""} ${record.ownerName || ""} ${record.documentNumber || ""}`.toLocaleLowerCase("ko").includes(search.toLocaleLowerCase("ko"))), [data, search]);
  const statusCounts = config.stages.map((stage) => ({ ...stage, count: data.filter((record) => record.status === stage.status).length }));
  const transition = useMutation({
    mutationFn: async (record: TeamWorkRecord) => {
      const index = stageIndex(config, record.status);
      const next = config.stages[index + 1];
      if (!next) return;
      const transitionError = getWorkflowTransitionError(record, next.status);
      if (transitionError) throw new Error(transitionError);
      await updateTeamWorkStatus(record, next.status);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["domain-workflow", config.key] }); toast.success("처리 단계를 변경했습니다."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveMutation = useMutation({ mutationFn: archiveTeamWorkRecord, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["domain-workflow", config.key] }); setArchiveTarget(null); toast.success(`${config.itemLabel}을 보관했습니다.`); } });
  const sampleMutation = useMutation({
    mutationFn: async () => { for (const sample of config.samples) if (!data.some((record) => record.title === sample.title)) await createTeamWorkRecord(sample); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["domain-workflow", config.key] }); toast.success("실무 샘플 데이터를 등록했습니다."); },
  });
  const today = new Date().toISOString().slice(0, 10);
  const overdue = data.filter((record) => isTeamWorkOverdue(record)).length;
  const dueSoon = data.filter((record) => record.status !== "completed" && record.dueDate && record.dueDate >= today && record.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;

  return <DashboardLayout><div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">{config.title}</h1><p className="mt-1 text-sm text-muted-foreground">{config.description}</p></div><div className="flex gap-2">{data.length === 0 && <Button variant="outline" disabled={sampleMutation.isPending} onClick={() => sampleMutation.mutate()}><ClipboardPlus className="mr-1.5 h-4 w-4" />샘플 업무 등록</Button>}<Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />{config.itemLabel} 등록</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">진행 중</p><p className="mt-1 text-2xl font-bold">{data.filter((record) => record.status !== "completed").length}건</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">7일 이내 기한</p><p className="mt-1 text-2xl font-bold">{dueSoon}건</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">기한 초과</p><p className={`mt-1 text-2xl font-bold ${overdue ? "text-destructive" : ""}`}>{overdue}건</p></CardContent></Card></div>
    <div className="flex min-w-max items-center gap-1 overflow-x-auto rounded-md border bg-card p-2">{statusCounts.map((stage, index) => <div key={stage.status} className="flex items-center"><div className="flex min-w-28 items-center justify-between gap-3 rounded px-3 py-2"><span className="text-sm font-medium">{stage.label}</span><Badge variant="secondary">{stage.count}</Badge></div>{index < statusCounts.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}</div>)}</div>
    <Card><CardHeader className="border-b p-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">{config.itemLabel} 처리대장</CardTitle><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={`${config.itemLabel} 검색`} className="w-72 pl-9" placeholder="번호, 장소, 담당자, 문서번호" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>관리번호</TableHead><TableHead>{config.itemLabel}·{config.locationLabel}</TableHead><TableHead>담당자</TableHead><TableHead>기한</TableHead><TableHead>문서번호</TableHead><TableHead>처리단계</TableHead><TableHead className="text-right">다음 조치</TableHead></TableRow></TableHeader><TableBody>
      {isLoading ? <TableRow><TableCell colSpan={7} className="h-32 text-center">불러오는 중...</TableCell></TableRow> : isError ? <TableRow><TableCell colSpan={7} className="h-32 text-center"><Button variant="outline" onClick={() => refetch()}>다시 시도</Button></TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="h-40 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-7 w-7" />등록된 {config.itemLabel}이 없습니다.</TableCell></TableRow> : filtered.map((record) => { const index = stageIndex(config, record.status); const stage = config.stages[index]; const next = config.stages[index + 1]; return <TableRow key={record.id} className={isTeamWorkOverdue(record) ? "bg-destructive/5" : ""}><TableCell className="font-mono text-xs">{record.recordNumber}</TableCell><TableCell><button className="text-left" onClick={() => setDetail(record)}><span className="block font-medium hover:underline">{record.title}</span><span className="text-xs text-muted-foreground">{record.parkingLot}</span></button></TableCell><TableCell>{record.ownerName || <span className="text-muted-foreground">미지정</span>}</TableCell><TableCell className={isTeamWorkOverdue(record) ? "font-semibold text-destructive" : ""}>{record.dueDate || "-"}</TableCell><TableCell className="max-w-52 truncate" title={record.documentNumber || undefined}><FileText className="mr-1 inline h-3.5 w-3.5" />{record.documentNumber || "미연결"}</TableCell><TableCell><Badge variant={record.status === "completed" ? "secondary" : "outline"}>{stage?.label}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="상세" onClick={() => setDetail(record)}><Eye className="h-4 w-4" /></Button>{next && <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate(record)}>{stage?.action}</Button>}</div></TableCell></TableRow>; })}
    </TableBody></Table></div></CardContent></Card>
  </div><RecordDialog key={`${dialogOpen}-${editing?.id || "new"}`} config={config} open={dialogOpen} record={editing} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }} />{detail && <DetailDialog config={config} record={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); setDialogOpen(true); }} onArchive={() => { setArchiveTarget(detail); setDetail(null); }} onDocumentLinked={async (documentNumber) => { const updated = await updateTeamWorkRecord(detail, { recordType: detail.recordType, team: detail.team, title: detail.title, category: detail.category, parkingLot: detail.parkingLot || "", ownerName: detail.ownerName || "", priority: detail.priority, status: detail.status, dueDate: detail.dueDate || "", amount: detail.amount, documentNumber, payload: detail.payload }, { linkDocument: false }); setDetail(updated); await queryClient.invalidateQueries({ queryKey: ["domain-workflow", config.key] }); }} />}<AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{config.itemLabel}을 보관하시겠습니까?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.recordNumber}은 활성 처리대장에서 제외되며 감사이력은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction disabled={archiveMutation.isPending} onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget)}>보관</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DashboardLayout>;
}
