import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  FIELD_VISIT_OUTCOME_LABELS,
  getComplaintEvidenceUrl,
  getComplaintFieldChecklist,
  listComplaintEvidence,
  recordComplaintFieldVisit,
  type FieldVisitOutcome,
} from "@/lib/complaint-field-work";
import { getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";
import { Camera, ClipboardCheck, ExternalLink, Image, MapPin, Save, Wifi, WifiOff } from "lucide-react";

interface ComplaintFieldWorkPanelProps {
  complaintId: string;
  complaintNumber: string;
  lotType?: string | null;
  subCategory?: string | null;
  status: string;
  canEdit: boolean;
  authorId: string;
  authorName: string;
  comments: Array<{ id: string; comment_type?: string | null; created_at?: string | null; content: string; attachment_path?: string | null }>;
  onSaved: () => void;
}

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ComplaintFieldWorkPanel({
  complaintId,
  complaintNumber,
  lotType,
  subCategory,
  status,
  canEdit,
  authorId,
  authorName,
  comments,
  onSaved,
}: ComplaintFieldWorkPanelProps) {
  const queryClient = useQueryClient();
  const profile = getParkingLotWorkProfile(lotType);
  const checklist = useMemo(() => getComplaintFieldChecklist(lotType, subCategory), [lotType, subCategory]);
  const visits = useMemo(() => comments.filter((comment) => comment.comment_type === "field_visit"), [comments]);
  const draftKey = `parkmaster-complaint-field-draft-${complaintId}`;
  const legacyDraftKey = `parkmaster:complaint-field-draft:${complaintId}`;
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [visitedAt, setVisitedAt] = useState(localDateTimeValue);
  const [outcome, setOutcome] = useState<FieldVisitOutcome>("confirmed");
  const [observation, setObservation] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [checkedItemIds, setCheckedItemIds] = useState<string[]>([]);
  const [captureLocation, setCaptureLocation] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const { data: evidence = [] } = useQuery({
    queryKey: ["complaint-evidence", complaintId],
    queryFn: () => listComplaintEvidence(complaintId),
  });
  const visibleEvidence = useMemo(() => {
    const byPath = new Map(evidence.map((item) => [item.file_path, item]));
    comments.forEach((comment) => {
      if (!comment.attachment_path || byPath.has(comment.attachment_path)) return;
      byPath.set(comment.attachment_path, {
        id: `comment-${comment.id}`,
        file_name: comment.attachment_path.split("/").pop() || "연계 시설작업 증빙",
        file_path: comment.attachment_path,
      } as (typeof evidence)[number]);
    });
    return Array.from(byPath.values());
  }, [comments, evidence]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey) || localStorage.getItem(legacyDraftKey);
    if (!saved) return;
    try {
      const draft = JSON.parse(saved);
      setVisitedAt(draft.visitedAt || localDateTimeValue());
      setOutcome(draft.outcome || "confirmed");
      setObservation(draft.observation || "");
      setActionTaken(draft.actionTaken || "");
      setCheckedItemIds(Array.isArray(draft.checkedItemIds) ? draft.checkedItemIds : []);
      setCaptureLocation(Boolean(draft.captureLocation));
      localStorage.setItem(draftKey, saved);
      localStorage.removeItem(legacyDraftKey);
    } catch {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(legacyDraftKey);
    }
  }, [draftKey, legacyDraftKey]);

  useEffect(() => {
    if (!open) return;
    localStorage.setItem(draftKey, JSON.stringify({ visitedAt, outcome, observation, actionTaken, checkedItemIds, captureLocation }));
  }, [actionTaken, captureLocation, checkedItemIds, draftKey, observation, open, outcome, visitedAt]);

  const requiredComplete = checklist.filter((item) => item.required).every((item) => checkedItemIds.includes(item.id));
  const canSubmit = online && observation.trim().length >= 5 && requiredComplete && files.length > 0 && !saving;

  const resetForm = () => {
    setVisitedAt(localDateTimeValue());
    setOutcome("confirmed");
    setObservation("");
    setActionTaken("");
    setCheckedItemIds([]);
    setCaptureLocation(false);
    setFiles([]);
    setFileInputKey((value) => value + 1);
    localStorage.removeItem(draftKey);
  };

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const result = await recordComplaintFieldVisit({
        complaintId,
        complaintNumber,
        authorId,
        authorName,
        lotType,
        subCategory,
        status,
        visitedAt,
        outcome,
        observation,
        actionTaken,
        checkedItemIds,
        captureLocation,
      }, files);
      await queryClient.invalidateQueries({ queryKey: ["complaint-evidence", complaintId] });
      onSaved();
      setOpen(false);
      resetForm();
      toast({
        title: "현장 확인을 등록했습니다",
        description: result.uploadErrors.length
          ? `사진 ${result.uploadedPaths.length}건 저장, ${result.uploadErrors.length}건 실패했습니다.`
          : `사진 ${result.uploadedPaths.length}건을 증빙으로 저장했습니다.`,
        variant: result.uploadErrors.length ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({ title: "현장 확인 등록 실패", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEvidence = async (filePath: string) => {
    try {
      window.open(await getComplaintEvidenceUrl(filePath), "_blank", "noopener,noreferrer");
    } catch (error: any) {
      toast({ title: "증빙 열기 실패", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm"><ClipboardCheck className="h-4 w-4" />현장 확인·증빙</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{profile.label}</Badge>
            <Badge variant={online ? "secondary" : "destructive"} className="gap-1">
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? "온라인" : "오프라인"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border p-2"><p className="text-lg font-semibold">{visits.length}</p><p className="text-[10px] text-muted-foreground">현장확인</p></div>
          <div className="rounded border p-2"><p className="text-lg font-semibold">{visibleEvidence.length}</p><p className="text-[10px] text-muted-foreground">사진증빙</p></div>
          <div className="rounded border p-2"><p className="text-xs font-semibold">{visits[0]?.created_at?.slice(0, 10) || "미실시"}</p><p className="text-[10px] text-muted-foreground">최근확인</p></div>
        </div>
        <p className="text-xs text-muted-foreground">{profile.workFocus}</p>
        {visibleEvidence.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {visibleEvidence.slice(0, 4).map((item) => (
              <Button key={item.id} variant="outline" size="sm" className="h-7 max-w-full gap-1 text-xs" onClick={() => openEvidence(item.file_path)}>
                <Image className="h-3 w-3" /><span className="max-w-36 truncate">{item.file_name}</span><ExternalLink className="h-3 w-3" />
              </Button>
            ))}
          </div>
        )}
        <Button className="w-full gap-2 sm:w-auto" onClick={() => setOpen(true)} disabled={!canEdit || status === "received" || status === "closed"}>
          <Camera className="h-4 w-4" />현장 확인 등록
        </Button>
        {status === "received" && <p className="text-xs text-amber-700">담당자 배정 후 현장 확인을 등록할 수 있습니다.</p>}
        {!online && <p className="text-xs text-amber-700">입력 내용은 이 기기에 임시 저장됩니다. 네트워크가 복구되면 사진을 다시 선택해 전송하세요.</p>}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>현장 확인 등록</DialogTitle>
            <DialogDescription>주차장 형태별 확인표와 사진 증빙으로 민원 현장조사 결과를 등록합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded border bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{profile.label}</Badge><span className="font-mono">{complaintNumber}</span></div>
              <p className="mt-2 text-muted-foreground">모바일에서는 카메라 촬영 후 바로 등록할 수 있습니다. 필수 항목과 사진 1장 이상이 필요합니다.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">현장 확인시각</Label><Input type="datetime-local" value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} /></div>
              <div>
                <Label className="text-xs">확인 결과</Label>
                <Select value={outcome} onValueChange={(value) => setOutcome(value as FieldVisitOutcome)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FIELD_VISIT_OUTCOME_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">현장 확인표</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {checklist.map((item) => (
                  <label key={item.id} className="flex min-h-10 items-start gap-2 rounded border p-2 text-xs">
                    <Checkbox checked={checkedItemIds.includes(item.id)} onCheckedChange={(checked) => setCheckedItemIds((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                    <span>{item.label}{item.required && <span className="ml-1 text-destructive">필수</span>}</span>
                  </label>
                ))}
              </div>
            </div>
            <div><Label className="text-xs">현장 관찰내용 *</Label><Textarea rows={4} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="민원 내용과 실제 현장 상태, 원인, 위험 범위를 기록하세요." /></div>
            <div><Label className="text-xs">현장 조치·후속조치</Label><Textarea rows={3} value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="즉시 조치, 통제, 업체 요청, 추가 작업 필요사항을 기록하세요." /></div>
            <div>
              <Label className="text-xs">현장 사진 *</Label>
              <Input key={fileInputKey} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
              <p className="mt-1 text-[10px] text-muted-foreground">전체 위치와 문제 지점을 확인할 수 있는 사진을 등록하세요. 선택 {files.length}건</p>
            </div>
            <label className="flex items-start gap-2 rounded border p-3 text-xs">
              <Checkbox checked={captureLocation} onCheckedChange={(checked) => setCaptureLocation(Boolean(checked))} />
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />사진 증빙에 현재 위치를 포함합니다. 기기에서 위치 권한을 요청할 수 있습니다.</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { localStorage.setItem(draftKey, JSON.stringify({ visitedAt, outcome, observation, actionTaken, checkedItemIds, captureLocation })); setOpen(false); }}><Save className="mr-1 h-4 w-4" />기기 임시저장</Button>
            <Button onClick={handleSave} disabled={!canSubmit}>{saving ? "등록 중..." : "현장 확인 등록"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
