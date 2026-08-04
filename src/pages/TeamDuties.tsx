import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  ClipboardPlus,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DUTY_TEAM_LABELS,
  type DutyAssignmentStatus,
  type DutyTeam,
  type TeamDuty,
} from "@/config/team-duty-catalog";
import {
  archiveTeamDuty,
  createTeamDuty,
  listTeamDuties,
  listTeamDutyOptions,
  restoreTeamDuty,
  seedTeamDuties,
  updateTeamDuty,
  type TeamDutyInput,
} from "@/lib/team-duty-registry";
import { TEAM_RECORD_LABELS, type TeamRecordType } from "@/types/team-work";
import { LOT_TYPE_LABELS, type LotType } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import { stableMultiSort, type SortDirection } from "@/lib/list-sorting";

const LOT_TYPES: LotType[] = ["offstreet", "multilevel", "onstreet"];
const DESTINATIONS = [
  ["/team-work", "팀 업무관리"],
  ["/ops/abandoned-vehicles", "방치차량 처리"],
  ["/ops/security-inspections", "관제·보안 점검"],
  ["/planning/procedures", "사업 행정절차"],
  ["/ops", "운영 현황"],
  ["/ops/staff", "인력 관리"],
  ["/ops/exemptions", "감면 관리"],
  ["/facility/maintenance", "유지보수"],
  ["/facility/safety", "안전점검"],
  ["/revenue", "수입 현황"],
  ["/revenue/daily", "일별 수입"],
  ["/revenue/reconcile", "위탁 대사"],
  ["/planning", "신설기획"],
  ["/planning/sites", "후보부지"],
  ["/planning/projects", "공사 관리"],
  ["/realtime", "실시간 정보"],
] as const;
const RECORD_TYPES = Object.keys(TEAM_RECORD_LABELS) as TeamRecordType[];
const STATUS_LABELS: Record<DutyAssignmentStatus, string> = {
  active: "정상 담당",
  handover_pending: "인수인계 중",
  temporary: "대체 담당",
};

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function emptyDuty(team: DutyTeam, assigneeId = ""): TeamDutyInput {
  return {
    team,
    area: "",
    role: "주무관",
    phone: "",
    duties: [],
    recordType: "work_order",
    category: "기타",
    destination: "/team-work",
    destinationLabel: "팀 업무관리",
    primaryAssigneeId: assigneeId,
    deputyAssigneeId: null,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: null,
    lotTypes: [...LOT_TYPES],
    documentId: null,
    documentNumber: null,
    assignmentStatus: "active",
    handoverDueDate: null,
    handoverNote: null,
    changeReason: null,
  };
}

function dutyInput(duty: TeamDuty): TeamDutyInput {
  return {
    team: duty.team,
    area: duty.area,
    role: duty.role,
    phone: duty.phone,
    duties: duty.duties,
    recordType: duty.recordType,
    category: duty.category,
    destination: duty.destination,
    destinationLabel: duty.destinationLabel,
    primaryAssigneeId: duty.primaryAssigneeId,
    primaryAssigneeName: duty.primaryAssigneeName,
    deputyAssigneeId: duty.deputyAssigneeId,
    deputyAssigneeName: duty.deputyAssigneeName,
    effectiveFrom: duty.effectiveFrom,
    effectiveTo: duty.effectiveTo,
    lotTypes: duty.lotTypes || [...LOT_TYPES],
    documentId: duty.documentId,
    documentNumber: duty.documentNumber,
    assignmentStatus: duty.assignmentStatus || "active",
    handoverDueDate: duty.handoverDueDate,
    handoverNote: duty.handoverNote,
    changeReason: "",
  };
}

function buildTeamWorkUrl(duty: TeamDuty) {
  const params = new URLSearchParams({
    tab: duty.recordType,
    team: duty.team,
    category: duty.category,
    new: "1",
    title: `[${duty.area}] ${duty.duties[0] || "담당업무 처리"}`,
    ownerId: duty.primaryAssigneeId || "",
    ownerName: duty.primaryAssigneeName || "",
    dueDate: dateAfter(7),
    documentNumber: duty.documentNumber || "",
    nextAction: duty.duties[0] || "담당업무 확인",
    sourceModule: "TEAM_DUTY",
    sourcePath: `/team-work/duties?duty=${duty.id}`,
  });
  if (duty.lotTypes?.length === 1) {
    params.set("parkingLotType", duty.lotTypes[0]);
    params.set("parkingLot", `${LOT_TYPE_LABELS[duty.lotTypes[0]]} 공통`);
  }
  return `/team-work?${params.toString()}`;
}

function DutyDialog({
  open,
  duty,
  team,
  mode,
  options,
  onOpenChange,
}: {
  open: boolean;
  duty: TeamDuty | null;
  team: DutyTeam;
  mode: "edit" | "handover";
  options: Awaited<ReturnType<typeof listTeamDutyOptions>>;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TeamDutyInput>(() =>
    duty ? dutyInput(duty) : emptyDuty(team, options.assignees[0]?.id),
  );
  const [dutyText, setDutyText] = useState(() => duty?.duties.join("\n") || "");
  useEffect(() => {
    const next = duty
      ? dutyInput(duty)
      : emptyDuty(team, options.assignees[0]?.id);
    if (mode === "handover") {
      next.assignmentStatus = "handover_pending";
      next.handoverDueDate = dateAfter(7);
      next.changeReason = "담당자 변경 및 인수인계";
    }
    setForm(next);
    setDutyText(duty?.duties.join("\n") || "");
  }, [duty, mode, open, options.assignees, team]);
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        ...form,
        duties: dutyText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      return duty ? updateTeamDuty(duty, input) : createTeamDuty(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-duties"] });
      toast.success(
        mode === "handover"
          ? "인수인계를 요청했습니다."
          : duty
            ? "업무분장을 수정했습니다."
            : "업무분장을 추가했습니다.",
      );
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const set = <K extends keyof TeamDutyInput>(
    key: K,
    value: TeamDutyInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const toggleLotType = (lotType: LotType, checked: boolean) =>
    set(
      "lotTypes",
      checked
        ? [...new Set([...(form.lotTypes || []), lotType])]
        : (form.lotTypes || []).filter((value) => value !== lotType),
    );
  const chooseDestination = (path: string) => {
    const destination =
      DESTINATIONS.find(([value]) => value === path) || DESTINATIONS[0];
    set("destination", destination[0]);
    set("destinationLabel", destination[1]);
  };
  const deputyOptions = options.assignees.filter(
    (item) => item.id !== form.primaryAssigneeId,
  );
  const hasValidDeputy = Boolean(
    form.deputyAssigneeId && form.deputyAssigneeId !== form.primaryAssigneeId,
  );
  const statusRequirementsMet =
    form.assignmentStatus === "handover_pending"
      ? Boolean(
          hasValidDeputy && form.handoverDueDate && form.handoverNote?.trim(),
        )
      : form.assignmentStatus === "temporary"
        ? Boolean(hasValidDeputy && form.effectiveTo)
        : true;
  const canSave = Boolean(
    form.area.trim() &&
    dutyText.trim() &&
    form.category.trim() &&
    form.primaryAssigneeId &&
    form.lotTypes?.length &&
    statusRequirementsMet &&
    (!duty || form.changeReason?.trim()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "handover"
              ? "업무 인수인계"
              : duty
                ? "업무분장 수정"
                : "업무분장 추가"}
          </DialogTitle>
          <DialogDescription>
            {mode === "handover"
              ? "기존 분장을 복사했습니다. 새 담당자와 인계 내용만 확인하면 됩니다."
              : "책임 범위와 실제 담당자를 공식 문서 근거와 함께 관리합니다."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="duty-team">담당 팀</Label>
            <Select
              value={form.team}
              onValueChange={(value) => set("team", value as DutyTeam)}
            >
              <SelectTrigger id="duty-team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operations">운영팀</SelectItem>
                <SelectItem value="facilities">시설팀</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-area">업무영역 *</Label>
            <Input
              id="duty-area"
              value={form.area}
              onChange={(event) => set("area", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-role">담당 역할</Label>
            <Input
              id="duty-role"
              value={form.role}
              onChange={(event) => set("role", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-phone">전화번호</Label>
            <Input
              id="duty-phone"
              placeholder="064-728-0000"
              value={form.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-owner">실제 담당자 *</Label>
            <Select
              value={form.primaryAssigneeId || "__none__"}
              onValueChange={(value) =>
                set("primaryAssigneeId", value === "__none__" ? null : value)
              }
            >
              <SelectTrigger id="duty-owner">
                <SelectValue placeholder="담당자 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">미지정</SelectItem>
                {options.assignees.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-deputy">대체·인수 담당자</Label>
            <Select
              value={form.deputyAssigneeId || "__none__"}
              onValueChange={(value) =>
                set("deputyAssigneeId", value === "__none__" ? null : value)
              }
            >
              <SelectTrigger id="duty-deputy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">미지정</SelectItem>
                {deputyOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {deputyOptions.length === 0 && (
              <p className="text-xs text-destructive">
                인수인계 가능한 다른 활성 사용자가 없습니다. 시스템 설정에서
                사용자를 먼저 등록해 주세요.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-from">시행일 *</Label>
            <Input
              id="duty-from"
              type="date"
              value={form.effectiveFrom || ""}
              onChange={(event) => set("effectiveFrom", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-to">종료일</Label>
            <Input
              id="duty-to"
              type="date"
              value={form.effectiveTo || ""}
              onChange={(event) =>
                set("effectiveTo", event.target.value || null)
              }
            />
          </div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">적용 주차장 형태 *</legend>
            <div className="flex flex-wrap gap-4">
              {LOT_TYPES.map((lotType) => (
                <label
                  key={lotType}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.lotTypes?.includes(lotType)}
                    onCheckedChange={(checked) =>
                      toggleLotType(lotType, checked === true)
                    }
                  />
                  {LOT_TYPE_LABELS[lotType]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="duty-items">세부 담당업무 * (한 줄에 한 건)</Label>
            <Textarea
              id="duty-items"
              className="min-h-32"
              value={dutyText}
              onChange={(event) => setDutyText(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-record-type">처리 유형</Label>
            <Select
              value={form.recordType}
              onValueChange={(value) =>
                set("recordType", value as TeamRecordType)
              }
            >
              <SelectTrigger id="duty-record-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TEAM_RECORD_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-category">업무 분류 *</Label>
            <Input
              id="duty-category"
              value={form.category}
              onChange={(event) => set("category", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-destination">연결 메뉴</Label>
            <Select value={form.destination} onValueChange={chooseDestination}>
              <SelectTrigger id="duty-destination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESTINATIONS.map(([path, label]) => (
                  <SelectItem key={path} value={path}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-document">근거 문서</Label>
            <Select
              value={form.documentNumber || "__none__"}
              onValueChange={(value) =>
                set("documentNumber", value === "__none__" ? null : value)
              }
            >
              <SelectTrigger id="duty-document">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">미연결</SelectItem>
                {options.documents.map((item) => (
                  <SelectItem key={item.id} value={item.documentNumber}>
                    {item.documentNumber} · {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duty-status">담당 상태</Label>
            <Select
              value={form.assignmentStatus || "active"}
              onValueChange={(value) =>
                set("assignmentStatus", value as DutyAssignmentStatus)
              }
            >
              <SelectTrigger id="duty-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(form.assignmentStatus === "handover_pending" ||
            form.assignmentStatus === "temporary") && (
            <div className="space-y-2">
              <Label htmlFor="duty-handover-due">인수인계 기한</Label>
              <Input
                id="duty-handover-due"
                type="date"
                value={form.handoverDueDate || ""}
                onChange={(event) =>
                  set("handoverDueDate", event.target.value || null)
                }
              />
            </div>
          )}
          {(form.assignmentStatus === "handover_pending" ||
            mode === "handover") && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="duty-handover-note">인계 내용 *</Label>
              <Textarea
                id="duty-handover-note"
                value={form.handoverNote || ""}
                onChange={(event) => set("handoverNote", event.target.value)}
                placeholder="진행 중 업무, 주의사항, 미결 문서를 기록"
              />
            </div>
          )}
          {duty && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="duty-change-reason">변경 사유 *</Label>
              <Input
                id="duty-change-reason"
                value={form.changeReason || ""}
                onChange={(event) => set("changeReason", event.target.value)}
                placeholder="인사이동, 휴가 대체, 업무 조정 등"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={mutation.isPending || !canSave}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "저장 중..."
              : mode === "handover"
                ? "인수인계 요청"
                : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DutyDetail({
  duty,
  open,
  onOpenChange,
}: {
  duty: TeamDuty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!duty) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{duty.area}</DialogTitle>
          <DialogDescription>
            {DUTY_TEAM_LABELS[duty.team]} ·{" "}
            {TEAM_RECORD_LABELS[duty.recordType]}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">실제 담당자</dt>
            <dd className="mt-1 font-medium">
              {duty.primaryAssigneeName || "미지정"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">대체·인수 담당자</dt>
            <dd className="mt-1 font-medium">
              {duty.deputyAssigneeName || "미지정"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">효력기간</dt>
            <dd className="mt-1 font-medium">
              {duty.effectiveFrom || "-"} ~ {duty.effectiveTo || "계속"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">상태</dt>
            <dd className="mt-1 font-medium">
              {STATUS_LABELS[duty.assignmentStatus || "active"]}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">주차장 형태</dt>
            <dd className="mt-2 flex flex-wrap gap-1">
              {duty.lotTypes?.map((type) => (
                <Badge key={type} variant="secondary">
                  {LOT_TYPE_LABELS[type]}
                </Badge>
              ))}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">근거 문서</dt>
            <dd className="mt-1 font-medium">
              {duty.documentNumber || "미연결"}
            </dd>
          </div>
          {duty.handoverNote && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">인계 내용</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm">
                {duty.handoverNote}
              </dd>
            </div>
          )}
        </dl>
        <div>
          <h3 className="mb-2 text-sm font-semibold">세부 담당업무</h3>
          <ul className="space-y-1.5">
            {duty.duties.map((item) => (
              <li
                key={item}
                className="text-sm before:mr-2 before:text-muted-foreground before:content-['•']"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamDuties() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [team, setTeam] = useState<DutyTeam>("operations");
  const [search, setSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lotTypeFilter, setLotTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sortKey, setSortKey] = useState("area");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"edit" | "handover">("edit");
  const [editing, setEditing] = useState<TeamDuty | null>(null);
  const [selected, setSelected] = useState<TeamDuty | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TeamDuty | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const canManage = ["admin", "manager", "editor"].includes(
    profile?.role || "viewer",
  );
  const canRestore = ["admin", "manager"].includes(profile?.role || "viewer");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["team-duties", showArchived ? "archived" : "active"],
    queryFn: () => listTeamDuties(showArchived),
  });
  const { data: options = { assignees: [], documents: [] } } = useQuery({
    queryKey: ["team-duty-options"],
    queryFn: listTeamDutyOptions,
  });
  useEffect(() => {
    const requested = searchParams.get("duty");
    if (requested && data?.duties.length)
      setSelected(data.duties.find((item) => item.id === requested) || null);
  }, [data?.duties, searchParams]);
  const rows = useMemo(() => {
    const duties = data?.duties || [];
    const filtered = duties.filter(
      (duty) =>
        duty.team === team &&
        (recordFilter === "all" || duty.recordType === recordFilter) &&
        (statusFilter === "all" || duty.assignmentStatus === statusFilter) &&
        (lotTypeFilter === "all" ||
          duty.lotTypes?.includes(lotTypeFilter as LotType)) &&
        (ownerFilter === "all" ||
          (ownerFilter === "unassigned"
            ? !duty.primaryAssigneeId
            : duty.primaryAssigneeId === ownerFilter)) &&
        [
          duty.area,
          duty.role,
          duty.phone,
          duty.category,
          duty.destinationLabel,
          duty.primaryAssigneeName,
          duty.deputyAssigneeName,
          duty.documentNumber,
          ...duty.duties,
        ]
          .join(" ")
          .toLocaleLowerCase("ko")
          .includes(search.toLocaleLowerCase("ko")),
    );
    const valueFor = (duty: TeamDuty) =>
      sortKey === "taskCount"
        ? duty.duties.length
        : String(duty[sortKey as keyof TeamDuty] ?? "");
    return stableMultiSort(filtered, [
      { value: valueFor, direction: sortDirection },
      { value: (duty) => duty.area, direction: "asc" },
    ]);
  }, [
    data?.duties,
    lotTypeFilter,
    ownerFilter,
    recordFilter,
    search,
    sortDirection,
    sortKey,
    statusFilter,
    team,
  ]);
  const taskCount = rows.reduce((sum, duty) => sum + duty.duties.length, 0);
  const seedMutation = useMutation({
    mutationFn: seedTeamDuties,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-duties"] });
      toast.success("기준 업무분장을 불러왔습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ duty, reason }: { duty: TeamDuty; reason: string }) =>
      archiveTeamDuty(duty, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-duties"] });
      toast.success("업무분장을 보관했습니다.");
      setArchiveTarget(null);
      setArchiveReason("");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreTeamDuty,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-duties"] });
      toast.success("업무분장을 복구했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const openDialog = (
    duty: TeamDuty | null,
    mode: "edit" | "handover" = "edit",
  ) => {
    setEditing(duty);
    setDialogMode(mode);
    setDialogOpen(true);
  };
  const resetFilters = () => {
    setSearch("");
    setRecordFilter("all");
    setStatusFilter("all");
    setLotTypeFilter("all");
    setOwnerFilter("all");
  };

  const actionButtons = (duty: TeamDuty, mobile = false) => (
    <div
      className={`flex ${mobile ? "grid grid-cols-2" : "justify-end"} gap-1`}
    >
      {!showArchived && (
        <Button variant="outline" size="sm" asChild>
          <Link to={duty.destination}>
            {duty.destinationLabel}
            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
      {!showArchived && canManage && (
        <Button size="sm" asChild>
          <Link to={buildTeamWorkUrl(duty)}>
            <ClipboardPlus className="mr-1.5 h-4 w-4" />
            업무 등록
          </Link>
        </Button>
      )}
      {!showArchived && canManage && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openDialog(duty, "handover")}
        >
          <UserRoundCheck className="mr-1.5 h-4 w-4" />
          인수인계
        </Button>
      )}
      {!showArchived && canManage && (
        <Button
          size="icon"
          variant="ghost"
          title="업무분장 수정"
          aria-label={`${duty.area} 수정`}
          onClick={() => openDialog(duty)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {!showArchived && canManage && (
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive"
          title="업무분장 보관"
          aria-label={`${duty.area} 보관`}
          onClick={() => setArchiveTarget(duty)}
        >
          <Archive className="h-4 w-4" />
        </Button>
      )}
      {showArchived && canRestore && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => restoreMutation.mutate(duty)}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          복구
        </Button>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">차량관리과 업무분장 관리</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              실제 담당자·효력기간·인수인계·근거 문서를 하나의 책임 원장으로
              관리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowArchived((value) => !value);
                resetFilters();
              }}
            >
              <Archive className="mr-1.5 h-4 w-4" />
              {showArchived ? "활성 업무" : "보관함"}
            </Button>
            {canManage && !showArchived && (
              <Button onClick={() => openDialog(null)}>
                <Plus className="mr-1.5 h-4 w-4" />
                업무 추가
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y bg-card px-4 py-3">
          <Tabs
            value={team}
            onValueChange={(value) => setTeam(value as DutyTeam)}
          >
            <TabsList className="rounded-md">
              <TabsTrigger value="operations">운영팀</TabsTrigger>
              <TabsTrigger value="facilities">시설팀</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" />
              담당 {rows.length}개
            </span>
            <span className="font-medium">세부업무 {taskCount}건</span>
          </div>
        </div>
        <div className="grid gap-2 border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_145px_145px_145px_145px_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="업무분장 검색"
              className="pl-9"
              placeholder="업무, 담당자, 문서번호 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={recordFilter} onValueChange={setRecordFilter}>
            <SelectTrigger aria-label="처리 유형 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 처리유형</SelectItem>
              {RECORD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TEAM_RECORD_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="담당 상태 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 담당상태</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lotTypeFilter} onValueChange={setLotTypeFilter}>
            <SelectTrigger aria-label="주차장 형태 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 주차장 형태</SelectItem>
              {LOT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {LOT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger aria-label="담당자 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 담당자</SelectItem>
              <SelectItem value="unassigned">담당 미지정</SelectItem>
              {options.assignees.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger aria-label="정렬 기준">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="area">업무영역순</SelectItem>
              <SelectItem value="primaryAssigneeName">담당자순</SelectItem>
              <SelectItem value="effectiveFrom">시행일순</SelectItem>
              <SelectItem value="documentNumber">문서번호순</SelectItem>
              <SelectItem value="taskCount">세부업무수순</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="정렬 방향"
            onClick={() =>
              setSortDirection((value) => (value === "asc" ? "desc" : "asc"))
            }
          >
            {sortDirection === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetFilters}
          >
            초기화
          </Button>
        </div>
        {isError && (
          <div className="border border-destructive/40 p-6 text-center">
            <p className="text-sm text-destructive">
              업무분장을 불러오지 못했습니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => refetch()}
            >
              다시 시도
            </Button>
          </div>
        )}
        <div className="space-y-3 md:hidden">
          {isLoading ? (
            <p className="border bg-card p-8 text-center text-sm text-muted-foreground">
              불러오는 중...
            </p>
          ) : (
            rows.map((duty) => (
              <article key={duty.id} className="space-y-3 border bg-card p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelected(duty)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{duty.area}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {duty.primaryAssigneeName || "담당 미지정"} ·{" "}
                        {duty.role}
                      </p>
                    </div>
                    <Badge
                      variant={
                        duty.assignmentStatus === "handover_pending"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {STATUS_LABELS[duty.assignmentStatus || "active"]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {duty.lotTypes?.map((type) => (
                      <Badge key={type} variant="secondary">
                        {LOT_TYPE_LABELS[type]}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                    {duty.effectiveFrom || "-"} ~ {duty.effectiveTo || "계속"}
                  </p>
                </button>
                <details className="border-t pt-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    세부업무 {duty.duties.length}건
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {duty.duties.map((item) => (
                      <li
                        key={item}
                        className="text-sm before:mr-2 before:text-muted-foreground before:content-['•']"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </details>
                {actionButtons(duty, true)}
              </article>
            ))
          )}
          {!isLoading && rows.length === 0 && (
            <div className="border bg-card p-8 text-center text-sm text-muted-foreground">
              <p>표시할 업무분장이 없습니다.</p>
              {!showArchived && data?.duties.length === 0 && canManage && (
                <Button
                  variant="outline"
                  className="mt-3"
                  disabled={seedMutation.isPending}
                  onClick={() => seedMutation.mutate()}
                >
                  <ClipboardCheck className="mr-1.5 h-4 w-4" />
                  기준업무 불러오기
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="hidden overflow-x-auto border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>업무영역·범위</TableHead>
                <TableHead>실제 담당업무</TableHead>
                <TableHead>담당·효력기간</TableHead>
                <TableHead>근거 문서</TableHead>
                <TableHead className="text-right">처리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    불러오는 중...
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((duty) => (
                  <TableRow key={duty.id}>
                    <TableCell className="align-top">
                      <button
                        className="text-left"
                        onClick={() => setSelected(duty)}
                      >
                        <span className="block font-semibold hover:underline">
                          {duty.area}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {TEAM_RECORD_LABELS[duty.recordType]}
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          {duty.lotTypes?.map((type) => (
                            <Badge key={type} variant="secondary">
                              {LOT_TYPE_LABELS[type]}
                            </Badge>
                          ))}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="max-w-xl align-top">
                      <ul className="space-y-1.5">
                        {duty.duties.map((item) => (
                          <li
                            key={item}
                            className="text-sm before:mr-2 before:text-muted-foreground before:content-['•']"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-medium">
                        {duty.primaryAssigneeName || (
                          <span className="text-destructive">담당 미지정</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {duty.role} · {duty.phone || "전화 미등록"}
                      </div>
                      {duty.deputyAssigneeName && (
                        <div className="mt-1 text-xs">
                          대체·인수: {duty.deputyAssigneeName}
                        </div>
                      )}
                      <Badge
                        variant={
                          duty.assignmentStatus === "handover_pending"
                            ? "destructive"
                            : "outline"
                        }
                        className="mt-2"
                      >
                        {STATUS_LABELS[duty.assignmentStatus || "active"]}
                      </Badge>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {duty.effectiveFrom || "-"} ~{" "}
                        {duty.effectiveTo || "계속"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 align-top">
                      <div className="flex items-start gap-1.5 text-xs">
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">
                          {duty.documentNumber || "근거 문서 미연결"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {actionButtons(duty)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    표시할 업무분장이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DutyDialog
        key={`${dialogOpen}-${editing?.id || "new"}-${dialogMode}`}
        open={dialogOpen}
        duty={editing}
        team={team}
        mode={dialogMode}
        options={options}
        onOpenChange={setDialogOpen}
      />
      <DutyDetail
        duty={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      />
      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
            setArchiveReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무분장을 보관하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.area} 항목은 보관함으로 이동하며 복구할 수
              있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="duty-archive-reason">보관 사유 *</Label>
            <Input
              id="duty-archive-reason"
              value={archiveReason}
              onChange={(event) => setArchiveReason(event.target.value)}
              placeholder="조직개편, 중복 등록 등"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={!archiveReason.trim() || archiveMutation.isPending}
              onClick={() =>
                archiveTarget &&
                archiveMutation.mutate({
                  duty: archiveTarget,
                  reason: archiveReason,
                })
              }
            >
              보관
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
