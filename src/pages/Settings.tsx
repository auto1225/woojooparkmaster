import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  FileClock,
  GitBranch,
  HardDrive,
  History,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  Package,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runtimeConfig } from "@/config/runtime-config";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses, useSystemConfig } from "@/hooks/useSystemConfig";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import ApprovalLineManagement from "@/pages/settings/ApprovalLineManagement";
import MessageManagement from "@/pages/settings/MessageManagement";
import SecurityManagement from "@/pages/settings/SecurityManagement";

type ConfigField = {
  key: string;
  label: string;
  description: string;
  type?: "text" | "email" | "tel" | "number";
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
};

type ConfigChange = { key: string; label: string; oldValue: string | null; newValue: string };
type ActivityDetails = { changes?: ConfigChange[]; previousActive?: boolean; active?: boolean };
type ActivityRow = {
  id: string;
  action: string;
  created_at: string | null;
  details: ActivityDetails | null;
  target_name: string | null;
  user_name: string | null;
};

const CONFIG_FIELDS: ConfigField[] = [
  { key: "org_name", label: "기관명", description: "인쇄물과 보고서에 표시되는 기관명", required: true, placeholder: "제주시청" },
  { key: "org_code", label: "기관 코드", description: "내부 연계와 자료 구분에 사용하는 코드", placeholder: "JJC" },
  { key: "org_full_name", label: "부서명", description: "업무 문서와 통계에 표시되는 주 사용부서", required: true, placeholder: "제주시청 차량관리과 운영팀" },
  { key: "org_address", label: "기관 주소", description: "공문과 출력물에 표시되는 주소" },
  { key: "org_phone", label: "대표 전화", description: "담당부서의 대표 연락처", type: "tel", placeholder: "064-728-3821" },
  { key: "admin_email", label: "관리자 이메일", description: "시스템 운영 알림을 확인할 주소", type: "email", placeholder: "parking@jejusi.go.kr" },
  { key: "map_center_lat", label: "지도 중심 위도", description: "주차장 지도 최초 표시 위치", type: "number", min: -90, max: 90, step: "0.000001" },
  { key: "map_center_lng", label: "지도 중심 경도", description: "주차장 지도 최초 표시 위치", type: "number", min: -180, max: 180, step: "0.000001" },
  { key: "map_zoom", label: "지도 확대 단계", description: "1에서 21 사이의 지도 확대 수준", type: "number", min: 1, max: 21, step: "1" },
  { key: "naver_map_client_id", label: "네이버 지도 Client ID", description: "지도 API 연결에 사용하는 공개 클라이언트 식별자" },
];

const FIELD_LABELS = Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, field.label]));
const MODULE_LABELS: Record<string, string> = {
  CORE: "기본 업무", SURVEY: "현황조사", OPS: "운영관리", FACILITY: "시설관리",
  REVENUE: "수입관리", BUDGET: "예산관리", PROCUREMENT: "입찰관리", SERVICE: "용역사업관리",
  COMPLAINT: "민원관리", PLANNING: "신설기획", REALTIME: "실시간 정보", REPORT: "보고서·통계",
};
const VALID_TABS = new Set(["organization", "modules", "messages", "approval", "operations", "security", "history", "developer"]);

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function validateConfig(values: Record<string, string>) {
  const errors: Record<string, string> = {};
  if (!values.org_name?.trim()) errors.org_name = "기관명을 입력하세요.";
  if (!values.org_full_name?.trim()) errors.org_full_name = "주 사용부서를 입력하세요.";
  if (values.admin_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.admin_email)) errors.admin_email = "이메일 형식을 확인하세요.";
  if (values.org_phone && !/^[0-9+()\-\s]{7,20}$/.test(values.org_phone)) errors.org_phone = "전화번호 형식을 확인하세요.";
  const ranges: Array<[string, number, number]> = [["map_center_lat", -90, 90], ["map_center_lng", -180, 180], ["map_zoom", 1, 21]];
  ranges.forEach(([key, min, max]) => {
    if (!values[key]) return;
    const parsed = Number(values[key]);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) errors[key] = `${min}에서 ${max} 사이의 값을 입력하세요.`;
  });
  return errors;
}

export default function SettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: config = {}, isLoading: configLoading } = useSystemConfig();
  const { data: licenses = [] } = useModuleLicenses();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "organization";
  const activeTab = VALID_TABS.has(requestedTab) ? requestedTab : "organization";
  const [editedConfig, setEditedConfig] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingModule, setPendingModule] = useState<{ code: string; name: string; active: boolean } | null>(null);
  const [rollbackEntry, setRollbackEntry] = useState<ActivityRow | null>(null);
  const [demoAction, setDemoAction] = useState<"seed" | "cleanup" | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const isAdmin = profile?.role === "admin";
  const demoToolsEnabled = runtimeConfig.deploymentMode === "development";
  const hasChanges = Object.keys(editedConfig).length > 0;

  const currentValues = useMemo(() => ({ ...config, ...editedConfig }), [config, editedConfig]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  const setConfigValue = (key: string, value: string) => {
    setFieldErrors((previous) => ({ ...previous, [key]: "" }));
    setEditedConfig((previous) => {
      const next = { ...previous };
      if (value === (config[key] ?? "")) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const errors = validateConfig(currentValues);
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        throw new Error("입력값을 확인하세요.");
      }
      const changes: ConfigChange[] = Object.entries(editedConfig).map(([key, newValue]) => ({
        key,
        label: FIELD_LABELS[key] || key,
        oldValue: config[key] ?? null,
        newValue: newValue.trim(),
      }));
      if (!changes.length) return;
      const now = new Date().toISOString();
      const { error } = await supabase.from("system_config").upsert(
        changes.map((change) => ({
          config_key: change.key,
          config_value: change.newValue,
          description: CONFIG_FIELDS.find((field) => field.key === change.key)?.description || null,
          updated_at: now,
        })),
        { onConflict: "config_key" },
      );
      if (error) throw error;
      await logActivity({
        module: "SYSTEM_SETTINGS",
        action: "기관 설정 변경",
        targetType: "system_config",
        targetName: `${changes.length}개 항목`,
        details: { changes },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-config"] });
      await queryClient.invalidateQueries({ queryKey: ["settings-history"] });
      setEditedConfig({});
      toast.success("시스템 설정을 저장했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moduleMutation = useMutation({
    mutationFn: async (item: { code: string; name: string; active: boolean }) => {
      const { error } = await supabase.from("module_licenses").update({
        is_active: item.active,
        activated_at: item.active ? new Date().toISOString() : null,
      }).eq("module_code", item.code);
      if (error) throw error;
      await logActivity({
        module: "SYSTEM_SETTINGS",
        action: item.active ? "모듈 사용" : "모듈 중지",
        targetType: "module_license",
        targetName: item.name,
        details: { previousActive: !item.active, active: item.active },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["module-licenses"] });
      await queryClient.invalidateQueries({ queryKey: ["settings-history"] });
      setPendingModule(null);
      toast.success("모듈 상태를 변경했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: operations, isFetching: operationsLoading, refetch: refreshOperations } = useQuery({
    queryKey: ["settings-operations"],
    queryFn: async () => {
      const [database, storage, lots, users, equipment, documents, latest] = await Promise.all([
        supabase.from("system_config").select("config_key").limit(1),
        supabase.storage.from("survey-photos").list("", { limit: 1 }),
        supabase.from("parking_lots").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("equipment").select("*", { count: "exact", head: true }),
        supabase.from("code_master").select("*", { count: "exact", head: true }).eq("group_code", "OFFICIAL_DOCUMENT").eq("is_active", true),
        supabase.from("system_config").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        database: !database.error,
        storage: !storage.error,
        online: navigator.onLine,
        lotCount: lots.count || 0,
        userCount: users.count || 0,
        equipmentCount: equipment.count || 0,
        documentCount: documents.count || 0,
        latestUpdate: latest.data?.updated_at || null,
        checkedAt: new Date().toISOString(),
      };
    },
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["settings-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_logs")
        .select("id, action, created_at, details, target_name, user_name")
        .eq("module", "SYSTEM_SETTINGS")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ActivityRow[];
    },
    enabled: isAdmin,
  });

  const rollbackMutation = useMutation({
    mutationFn: async (entry: ActivityRow) => {
      const changes = entry.details?.changes || [];
      if (!changes.length) throw new Error("복원할 이전 값이 없습니다.");
      const { error: restoreError } = await (supabase.rpc as any)("restore_system_config", {
        p_changes: changes,
        p_source_log_id: entry.id,
      });
      if (!restoreError) return;

      const restoreMessage = `${restoreError.code || ""} ${restoreError.message || ""}`.toLowerCase();
      const isMigrationPending = restoreMessage.includes("pgrst202")
        || restoreMessage.includes("could not find the function")
        || restoreMessage.includes("404");
      if (!isMigrationPending) throw restoreError;

      // Compatibility path while the atomic server function is rolling out.
      const restoreRows = changes.filter((change) => change.oldValue !== null).map((change) => ({
        config_key: change.key,
        config_value: change.oldValue || "",
        description: CONFIG_FIELDS.find((field) => field.key === change.key)?.description || null,
        updated_at: new Date().toISOString(),
      }));
      if (restoreRows.length) {
        const { error } = await supabase.from("system_config").upsert(restoreRows, { onConflict: "config_key" });
        if (error) throw error;
      }
      for (const change of changes.filter((item) => item.oldValue === null)) {
        const { error } = await supabase.from("system_config").delete().eq("config_key", change.key);
        if (error) throw error;
      }
      await logActivity({
        module: "SYSTEM_SETTINGS",
        action: "기관 설정 복원",
        targetType: "system_config",
        targetName: `${changes.length}개 항목`,
        details: { changes: changes.map((change) => ({ ...change, oldValue: change.newValue, newValue: change.oldValue || "" })) },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-config"] });
      await queryClient.invalidateQueries({ queryKey: ["settings-history"] });
      setRollbackEntry(null);
      setEditedConfig({});
      toast.success("선택한 변경 이전 상태로 복원했습니다.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runDemoAction = async () => {
    if (!demoAction) return;
    setDemoRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요합니다.");
      const { runDemoCleanup, runDemoSeed } = await import("@/lib/demo-data-client");
      if (demoAction === "seed") await runDemoSeed(supabase, session.user.id);
      else await runDemoCleanup(supabase);
      await logActivity({
        module: "SYSTEM_SETTINGS",
        action: demoAction === "seed" ? "검증용 샘플 데이터 생성" : "검증용 샘플 데이터 정리",
        targetType: "demo_data",
        targetName: "전체 업무 모듈",
      });
      await queryClient.invalidateQueries();
      toast.success(demoAction === "seed" ? "검증용 샘플 데이터를 생성했습니다." : "검증용 샘플 데이터를 정리했습니다.");
      setDemoAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setDemoRunning(false);
    }
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[55vh] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h1 className="font-semibold">관리자 권한이 필요합니다</h1>
            <p className="mt-1 text-sm text-muted-foreground">시스템 설정은 관리자만 변경할 수 있습니다.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">시스템 설정</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">기관 기준정보, 업무 모듈, 보안과 운영 상태를 관리합니다.</p>
          </div>
          {hasChanges && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">저장하지 않은 변경 {Object.keys(editedConfig).length}건</Badge>
              <Button variant="outline" size="sm" onClick={() => { setEditedConfig({}); setFieldErrors({}); }}>
                <RotateCcw className="mr-1.5 h-4 w-4" />되돌리기
              </Button>
              <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}저장
              </Button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          <div className="overflow-x-auto border-b">
            <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
              <TabsTrigger value="organization" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><Building2 className="mr-1.5 h-4 w-4" />기관·업무</TabsTrigger>
              <TabsTrigger value="modules" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><Package className="mr-1.5 h-4 w-4" />모듈</TabsTrigger>
              <TabsTrigger value="messages" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><MessageSquare className="mr-1.5 h-4 w-4" />메시지</TabsTrigger>
              <TabsTrigger value="approval" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><GitBranch className="mr-1.5 h-4 w-4" />결재선</TabsTrigger>
              <TabsTrigger value="operations" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><HardDrive className="mr-1.5 h-4 w-4" />운영 상태</TabsTrigger>
              <TabsTrigger value="security" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><Lock className="mr-1.5 h-4 w-4" />보안</TabsTrigger>
              <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><History className="mr-1.5 h-4 w-4" />변경 이력</TabsTrigger>
              {demoToolsEnabled && <TabsTrigger value="developer" className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"><Wrench className="mr-1.5 h-4 w-4" />검증 도구</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="organization" className="mt-5 space-y-5">
            <section className="border bg-background">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold">기관 기준정보</h2>
                <p className="mt-1 text-sm text-muted-foreground">보고서, 공문, 출력물과 지도에서 공통으로 사용하는 정보입니다.</p>
              </div>
              <div className="grid gap-x-8 gap-y-5 p-5 lg:grid-cols-2">
                {CONFIG_FIELDS.map((field) => (
                  <div key={field.key} className={field.key === "org_address" || field.key === "naver_map_client_id" ? "lg:col-span-2" : ""}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Label htmlFor={`setting-${field.key}`}>{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</Label>
                      {editedConfig[field.key] !== undefined && <span className="text-xs font-medium text-primary">변경됨</span>}
                    </div>
                    <Input
                      id={`setting-${field.key}`}
                      type={field.type || "text"}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={currentValues[field.key] || ""}
                      placeholder={field.placeholder}
                      disabled={configLoading}
                      aria-invalid={Boolean(fieldErrors[field.key])}
                      onChange={(event) => setConfigValue(field.key, event.target.value)}
                    />
                    <p className={`mt-1.5 text-xs ${fieldErrors[field.key] ? "text-destructive" : "text-muted-foreground"}`}>{fieldErrors[field.key] || field.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border bg-background">
              <div className="flex items-start justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /><h2 className="font-semibold">외부 AI 보조 기능</h2></div>
                  <p className="mt-1 text-sm text-muted-foreground">민원 분류와 보고서 초안 작성에서 AI 보조 기능을 사용합니다.</p>
                  {!runtimeConfig.externalAiEnabled && <p className="mt-2 text-xs text-amber-700">서버 환경에서 외부 AI 연동이 비활성화되어 있어 설정을 켜도 실행되지 않습니다.</p>}
                </div>
                <Switch
                  aria-label="외부 AI 보조 기능"
                  checked={currentValues.ai_enabled === "true"}
                  disabled={!runtimeConfig.externalAiEnabled}
                  onCheckedChange={(checked) => setConfigValue("ai_enabled", checked ? "true" : "false")}
                />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="modules" className="mt-5">
            <section className="border bg-background">
              <div className="border-b px-5 py-4"><h2 className="font-semibold">업무 모듈 사용 관리</h2><p className="mt-1 text-sm text-muted-foreground">중지한 모듈은 해당 메뉴와 경로에서 즉시 사용할 수 없게 됩니다.</p></div>
              <Table>
                <TableHeader><TableRow><TableHead>모듈</TableHead><TableHead>구분</TableHead><TableHead>사용자 제한</TableHead><TableHead>만료일</TableHead><TableHead className="text-right">상태</TableHead></TableRow></TableHeader>
                <TableBody>
                  {licenses.map((license) => {
                    const locked = license.module_code === "CORE";
                    const expired = Boolean(license.expires_at && new Date(license.expires_at) < new Date());
                    return (
                      <TableRow key={license.id || license.module_code}>
                        <TableCell><div className="font-medium">{MODULE_LABELS[license.module_code] || license.module_name}</div><div className="text-xs text-muted-foreground">{license.module_code}</div></TableCell>
                        <TableCell>{license.license_type === "permanent" ? "영구" : license.license_type === "demo" ? "검증용" : license.license_type === "subscription" ? "구독" : license.license_type}</TableCell>
                        <TableCell>{license.max_users ? `${license.max_users.toLocaleString()}명` : "제한 없음"}</TableCell>
                        <TableCell>{license.expires_at ? <span className={expired ? "text-destructive" : ""}>{new Date(license.expires_at).toLocaleDateString("ko-KR")}</span> : "없음"}</TableCell>
                        <TableCell className="text-right"><div className="inline-flex items-center gap-2"><Badge variant={license.is_active && !expired ? "default" : "secondary"}>{expired ? "만료" : license.is_active ? "사용 중" : "중지"}</Badge><Switch checked={Boolean(license.is_active)} disabled={locked || expired || moduleMutation.isPending} aria-label={`${MODULE_LABELS[license.module_code] || license.module_name} 사용 여부`} onCheckedChange={(active) => setPendingModule({ code: license.module_code, name: MODULE_LABELS[license.module_code] || license.module_name, active })} /></div></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">기본 업무 모듈은 시스템 운영에 필수이므로 중지할 수 없습니다.</div>
            </section>
          </TabsContent>

          <TabsContent value="messages" className="mt-5"><MessageManagement /></TabsContent>
          <TabsContent value="approval" className="mt-5"><ApprovalLineManagement /></TabsContent>

          <TabsContent value="operations" className="mt-5 space-y-5">
            <section className="border bg-background">
              <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-semibold">실시간 운영 점검</h2><p className="mt-1 text-sm text-muted-foreground">화면을 열 때와 1분마다 실제 연결 상태를 확인합니다.</p></div><Button variant="outline" size="sm" disabled={operationsLoading} onClick={() => refreshOperations()}>{operationsLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}다시 점검</Button></div>
              <div className="grid md:grid-cols-3">
                {[
                  { label: "데이터베이스", value: operations?.database, note: "기준정보 조회" },
                  { label: "파일 저장소", value: operations?.storage, note: "현황조사 사진 저장소" },
                  { label: "브라우저 네트워크", value: operations?.online, note: "현재 접속 환경" },
                ].map((item) => <div key={item.label} className="flex items-center gap-3 border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">{item.value ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-destructive" />}<div><div className="font-medium">{item.label}</div><div className="text-xs text-muted-foreground">{operationsLoading ? "확인 중" : item.value ? `정상 · ${item.note}` : `점검 필요 · ${item.note}`}</div></div></div>)}
              </div>
            </section>
            <section className="border bg-background">
              <div className="border-b px-5 py-4"><h2 className="font-semibold">등록 자료 현황</h2><p className="mt-1 text-sm text-muted-foreground">운영 점검 시 기준이 되는 핵심 데이터 건수입니다.</p></div>
              <div className="grid grid-cols-2 lg:grid-cols-4">
                {[{ icon: Database, label: "주차장", value: operations?.lotCount }, { icon: Users, label: "사용자", value: operations?.userCount }, { icon: Wrench, label: "장비", value: operations?.equipmentCount }, { icon: FileClock, label: "공식 문서", value: operations?.documentCount }].map((item) => <div key={item.label} className="border-b p-5 even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0"><item.icon className="mb-3 h-4 w-4 text-muted-foreground" /><div className="text-2xl font-semibold">{(item.value || 0).toLocaleString()}</div><div className="mt-1 text-sm text-muted-foreground">{item.label}</div></div>)}
              </div>
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">최근 설정 변경: {formatDateTime(operations?.latestUpdate)} · 마지막 점검: {formatDateTime(operations?.checkedAt)}</div>
            </section>
            <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p>데이터베이스 백업 주기와 보관 기간은 배포 인프라에서 관리해야 합니다. 실행되지 않는 화면상의 예약값은 제거했으며, 실제 백업 정책은 운영 서버 관리자와 별도로 확인해야 합니다.</p></div>
          </TabsContent>

          <TabsContent value="security" className="mt-5"><SecurityManagement /></TabsContent>

          <TabsContent value="history" className="mt-5">
            <section className="border bg-background">
              <div className="border-b px-5 py-4"><h2 className="font-semibold">설정 변경 이력</h2><p className="mt-1 text-sm text-muted-foreground">누가 무엇을 변경했는지 확인하고 기관 설정을 이전 값으로 복원합니다.</p></div>
              <Table>
                <TableHeader><TableRow><TableHead>일시</TableHead><TableHead>처리</TableHead><TableHead>변경 내용</TableHead><TableHead>처리자</TableHead><TableHead className="text-right">복원</TableHead></TableRow></TableHeader>
                <TableBody>
                  {historyLoading && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
                  {!historyLoading && history.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">기록된 설정 변경이 없습니다.</TableCell></TableRow>}
                  {history.map((entry) => {
                    const changes = entry.details?.changes || [];
                    return <TableRow key={entry.id}><TableCell className="whitespace-nowrap text-sm">{formatDateTime(entry.created_at)}</TableCell><TableCell><Badge variant="outline">{entry.action}</Badge></TableCell><TableCell><div className="max-w-xl text-sm">{changes.length ? changes.map((change) => `${change.label || FIELD_LABELS[change.key] || change.key}: ${change.oldValue || "(없음)"} → ${change.newValue || "(없음)"}`).join(" · ") : entry.target_name || "-"}</div></TableCell><TableCell>{entry.user_name || "시스템"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" disabled={!changes.length || rollbackMutation.isPending} onClick={() => setRollbackEntry(entry)}><RotateCcw className="mr-1.5 h-4 w-4" />복원</Button></TableCell></TableRow>;
                  })}
                </TableBody>
              </Table>
            </section>
          </TabsContent>

          {demoToolsEnabled && <TabsContent value="developer" className="mt-5 space-y-4">
            <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>개발 환경에서만 표시되는 검증 도구입니다. 실제 전체 업무 메뉴에 샘플 자료를 생성하거나 검증 자료를 정리합니다.</p></div>
            <section className="border bg-background">
              <div className="grid md:grid-cols-2">
                <div className="border-b p-5 md:border-b-0 md:border-r"><Database className="mb-3 h-5 w-5 text-primary" /><h2 className="font-semibold">전체 샘플 데이터 생성</h2><p className="mt-1 min-h-10 text-sm text-muted-foreground">주차장, 시설, 운영, 민원, 수입, 예산, 입찰, 용역, 보고서 자료를 실제 데이터베이스에 채웁니다.</p><Button className="mt-4" onClick={() => setDemoAction("seed")}><Database className="mr-1.5 h-4 w-4" />생성</Button></div>
                <div className="p-5"><Trash2 className="mb-3 h-5 w-5 text-destructive" /><h2 className="font-semibold">검증 데이터 정리</h2><p className="mt-1 min-h-10 text-sm text-muted-foreground">샘플 표식이 있는 검증용 자료를 정리합니다. 실제 업무 자료가 섞이지 않았는지 먼저 확인하세요.</p><Button className="mt-4" variant="destructive" onClick={() => setDemoAction("cleanup")}><Trash2 className="mr-1.5 h-4 w-4" />정리</Button></div>
              </div>
            </section>
          </TabsContent>}
        </Tabs>
      </div>

      <Dialog open={Boolean(pendingModule)} onOpenChange={(open) => !open && setPendingModule(null)}>
        <DialogContent><DialogHeader><DialogTitle>모듈 상태 변경</DialogTitle><DialogDescription>{pendingModule?.name} 모듈을 {pendingModule?.active ? "사용" : "중지"} 상태로 변경합니다. 중지하면 관련 메뉴와 화면을 사용할 수 없습니다.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingModule(null)}>취소</Button><Button variant={pendingModule?.active ? "default" : "destructive"} disabled={moduleMutation.isPending} onClick={() => pendingModule && moduleMutation.mutate(pendingModule)}>{moduleMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}변경</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(rollbackEntry)} onOpenChange={(open) => !open && setRollbackEntry(null)}>
        <DialogContent><DialogHeader><DialogTitle>이전 설정으로 복원</DialogTitle><DialogDescription>{rollbackEntry?.details?.changes?.length || 0}개 항목을 이 변경 직전 값으로 되돌립니다. 복원 작업도 변경 이력에 기록됩니다.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRollbackEntry(null)}>취소</Button><Button disabled={rollbackMutation.isPending} onClick={() => rollbackEntry && rollbackMutation.mutate(rollbackEntry)}>{rollbackMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}복원</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(demoAction)} onOpenChange={(open) => !open && !demoRunning && setDemoAction(null)}>
        <DialogContent><DialogHeader><DialogTitle>{demoAction === "seed" ? "전체 샘플 데이터 생성" : "검증 데이터 정리"}</DialogTitle><DialogDescription>{demoAction === "seed" ? "모든 업무 모듈에 검증용 샘플 자료를 실제로 생성합니다." : "검증용 자료를 데이터베이스에서 정리합니다. 이 작업은 되돌릴 수 없습니다."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={demoRunning} onClick={() => setDemoAction(null)}>취소</Button><Button variant={demoAction === "cleanup" ? "destructive" : "default"} disabled={demoRunning} onClick={runDemoAction}>{demoRunning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{demoAction === "seed" ? "생성 시작" : "정리 시작"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
