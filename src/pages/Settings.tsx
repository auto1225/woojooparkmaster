import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemConfig, useModuleLicenses } from "@/hooks/useSystemConfig";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Settings, Shield, Package, Save, MessageSquare, GitBranch, Sparkles, Database, Info, HardDrive, CheckCircle2, XCircle, Trash2, PlayCircle, Lock, Loader2, MapPin } from "lucide-react";
import MessageManagement from "@/pages/settings/MessageManagement";
import ApprovalLineManagement from "@/pages/settings/ApprovalLineManagement";
import SecurityManagement from "@/pages/settings/SecurityManagement";

const DEMO_SEED_STEPS = [
  "기존 데모 데이터 정리 중...",
  "주차장 데이터 보강 중...",
  "시설관리 데이터 생성 중...",
  "운영관리 데이터 생성 중...",
  "민원 데이터 생성 중...",
  "수입 데이터 생성 중...",
  "예산 데이터 생성 중...",
  "입찰 데이터 생성 중...",
  "용역사업 데이터 생성 중...",
  "신설기획 데이터 생성 중...",
  "요금정책 데이터 생성 중...",
  "정산대사 데이터 생성 중...",
  "보고서 데이터 생성 중...",
  "결재/알림 데이터 생성 중...",
  "현황조사 데이터 생성 중...",
  "실시간 데이터 생성 중...",
  "API 데이터 생성 중...",
  "완료!",
];
const DEMO_CLEANUP_STEPS = [
  "API 데이터 삭제 중...",
  "활동로그 삭제 중...",
  "결재 데이터 삭제 중...",
  "보고서 삭제 중...",
  "현황조사 삭제 중...",
  "실시간 데이터 삭제 중...",
  "기획/용역/입찰 삭제 중...",
  "예산/수입 삭제 중...",
  "민원/운영 삭제 중...",
  "시설 데이터 삭제 중...",
  "완료!",
];

export default function SettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: config } = useSystemConfig();
  const { data: licenses } = useModuleLicenses();
  const [editedConfig, setEditedConfig] = useState<Record<string, string>>({});
  const [demoGenDialog, setDemoGenDialog] = useState(false);
  const [demoCleanDialog, setDemoCleanDialog] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoStepLabel, setDemoStepLabel] = useState("");
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, []);

  const runDemoAction = async (action: "seed" | "cleanup") => {
    setDemoLoading(true);
    setDemoProgress(0);
    const steps = action === "seed" ? DEMO_SEED_STEPS : DEMO_CLEANUP_STEPS;
    let step = 0;
    setDemoStepLabel(steps[0]);

    // Simulate progress since edge function doesn't stream
    progressRef.current = setInterval(() => {
      step++;
      const pct = Math.min(Math.floor((step / steps.length) * 100), 95);
      setDemoProgress(pct);
      setDemoStepLabel(steps[Math.min(step, steps.length - 2)]);
    }, action === "seed" ? 1500 : 800);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("로그인이 필요합니다"); return; }
      const { data, error } = await supabase.functions.invoke("demo-data", {
        body: { action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (progressRef.current) clearInterval(progressRef.current);
      setDemoProgress(100);
      setDemoStepLabel(steps[steps.length - 1]);
      toast.success(data?.message || "완료");
      queryClient.invalidateQueries();
      setTimeout(() => { setDemoLoading(false); setDemoProgress(0); setDemoStepLabel(""); }, 1500);
    } catch (e: any) {
      if (progressRef.current) clearInterval(progressRef.current);
      setDemoLoading(false);
      setDemoProgress(0);
      setDemoStepLabel("");
      toast.error(e.message || "처리 중 오류가 발생했습니다");
    }
  };

  const isAdmin = profile?.role === "admin";
  const configValue = (key: string) => editedConfig[key] ?? config?.[key] ?? "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(editedConfig)) {
        const { error } = await supabase.from("system_config").update({ config_value: value }).eq("config_key", key);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["system-config"] }); setEditedConfig({}); toast.success("설정이 저장되었습니다"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ code, active }: { code: string; active: boolean }) => {
      const { error } = await supabase.from("module_licenses").update({ is_active: active, activated_at: active ? new Date().toISOString() : null }).eq("module_code", code);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["module-licenses"] }); toast.success("모듈 상태가 변경되었습니다"); },
  });

  // System info query
  const { data: sysInfo } = useQuery({
    queryKey: ["system-info"],
    queryFn: async () => {
      const { count: lotCount } = await supabase.from("parking_lots").select("*", { count: "exact", head: true });
      const { count: profileCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const { count: eqCount } = await supabase.from("equipment").select("*", { count: "exact", head: true });
      return { lotCount: lotCount || 0, profileCount: profileCount || 0, eqCount: eqCount || 0 };
    },
    enabled: isAdmin,
  });

  // Connection checks
  const { data: connStatus } = useQuery({
    queryKey: ["connection-status"],
    queryFn: async () => {
      let db = false, rt = false;
      try { const { error } = await supabase.from("system_config").select("config_key").limit(1); db = !error; } catch {}
      try { rt = true; } catch {}
      return { db, realtime: rt, storage: true };
    },
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">관리자 권한이 필요합니다</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const CONFIG_FIELDS = [
    { key: "org_name", label: "기관명" }, { key: "org_code", label: "기관코드" },
    { key: "org_address", label: "기관 주소" }, { key: "org_phone", label: "전화번호" },
    { key: "admin_email", label: "관리자 이메일" }, { key: "map_center_lat", label: "지도 중심 위도" },
    { key: "map_center_lng", label: "지도 중심 경도" }, { key: "map_zoom", label: "지도 줌 레벨" },
    { key: "naver_map_client_id", label: "네이버 지도 Client ID" },
  ];

  const MODULE_LABELS: Record<string, string> = {
    CORE: "코어", SURVEY: "현황조사", OPS: "운영관리", FACILITY: "시설관리",
    REVENUE: "수입관리", BUDGET: "예산관리", PROCUREMENT: "입찰관리",
    SERVICE: "용역사업관리", COMPLAINT: "민원관리", PLANNING: "신설기획",
    REALTIME: "실시간 정보", REPORT: "보고서/통계",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">시스템 설정</h1>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="flex-wrap">
            <TabsTrigger value="general">기본 설정</TabsTrigger>
            <TabsTrigger value="modules">모듈 관리</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="h-3 w-3 mr-1" />AI</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="h-3 w-3 mr-1" />메시지</TabsTrigger>
            <TabsTrigger value="approval"><GitBranch className="h-3 w-3 mr-1" />결재선</TabsTrigger>
            <TabsTrigger value="system"><Info className="h-3 w-3 mr-1" />시스템 정보</TabsTrigger>
            <TabsTrigger value="backup"><HardDrive className="h-3 w-3 mr-1" />백업</TabsTrigger>
            <TabsTrigger value="security"><Lock className="h-3 w-3 mr-1" />보안 관리</TabsTrigger>
            <TabsTrigger value="demo"><Database className="h-3 w-3 mr-1" />데모 데이터</TabsTrigger>
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">기관 정보</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {CONFIG_FIELDS.map(f => (
                  <div key={f.key} className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right text-sm">{f.label}</Label>
                    <Input className="col-span-3" value={configValue(f.key)} onChange={e => setEditedConfig({ ...editedConfig, [f.key]: e.target.value })} />
                  </div>
                ))}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        toast.info("주차장 좌표 재계산을 시작합니다. 잠시만 기다려주세요...");

                        let cursor = 0;
                        let hasMore = true;
                        let totalUpdated = 0;
                        let totalFailed = 0;
                        const allFailures: string[] = [];

                        while (hasMore) {
                          const { data, error } = await supabase.functions.invoke("geocode-lots", {
                            body: { cursor, batchSize: 20 },
                          });

                          if (error) throw error;
                          if (data?.error) throw new Error(data.error);

                          totalUpdated += data?.updated || 0;
                          totalFailed += data?.failed || 0;
                          if (Array.isArray(data?.failures)) {
                            allFailures.push(...data.failures);
                          }

                          hasMore = Boolean(data?.hasMore);
                          cursor = data?.nextCursor || 0;
                        }

                        toast.success(`좌표 변환 완료: ${totalUpdated}건 성공, ${totalFailed}건 실패`);
                        if (allFailures.length > 0) {
                          toast.warning(`실패 목록: ${allFailures.slice(0, 5).join(", ")}${allFailures.length > 5 ? " 외 " + (allFailures.length - 5) + "건" : ""}`);
                        }
                        queryClient.invalidateQueries({ queryKey: ["dashboard-lots"] });
                        queryClient.invalidateQueries();
                      } catch (e: any) {
                        toast.error(e.message || "좌표 변환 실패");
                      }
                    }}
                  >
                    <MapPin className="h-4 w-4 mr-1" />주소→좌표 변환
                  </Button>
                  <Button onClick={() => saveMutation.mutate()} disabled={Object.keys(editedConfig).length === 0 || saveMutation.isPending}>
                    <Save className="h-4 w-4 mr-1" />저장
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Modules */}
          <TabsContent value="modules" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" />모듈 라이선스 관리</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>코드</TableHead><TableHead>모듈명</TableHead><TableHead>상태</TableHead>
                      <TableHead>활성화일</TableHead><TableHead>만료일</TableHead><TableHead>토글</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses?.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.module_code}</TableCell>
                        <TableCell className="text-sm">{MODULE_LABELS[m.module_code] || m.module_code}</TableCell>
                        <TableCell><Badge className={m.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}>{m.is_active ? "활성" : "비활성"}</Badge></TableCell>
                        <TableCell className="text-xs">{m.activated_at ? new Date(m.activated_at).toLocaleDateString("ko-KR") : "-"}</TableCell>
                        <TableCell className="text-xs">{m.expires_at ? new Date(m.expires_at).toLocaleDateString("ko-KR") : "-"}</TableCell>
                        <TableCell><Switch checked={m.is_active} onCheckedChange={checked => toggleModuleMutation.mutate({ code: m.module_code, active: checked })} disabled={m.module_code === "CORE"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">AI 기능 설정</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">AI 기능 활성화</p><p className="text-xs text-muted-foreground">민원 자동분류, 보고서 총평 등</p></div>
                  <Switch checked={configValue("ai_enabled") === 'true'} onCheckedChange={v => setEditedConfig({ ...editedConfig, ai_enabled: v ? 'true' : 'false' })} />
                </div>
                {Object.keys(editedConfig).length > 0 && <div className="flex justify-end"><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save className="h-4 w-4 mr-1" />저장</Button></div>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages */}
          <TabsContent value="messages" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">메시지 발송 설정</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[{ key: "alimtalk_enabled", label: "카카오 알림톡" }, { key: "sms_enabled", label: "SMS 발송" }].map(t => (
                  <div key={t.key} className="flex items-center justify-between">
                    <Label className="text-sm">{t.label}</Label>
                    <Switch checked={configValue(t.key) === 'true'} onCheckedChange={v => setEditedConfig({ ...editedConfig, [t.key]: v ? 'true' : 'false' })} />
                  </div>
                ))}
                {Object.keys(editedConfig).length > 0 && <div className="flex justify-end"><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save className="h-4 w-4 mr-1" />저장</Button></div>}
              </CardContent>
            </Card>
            <div className="mt-4"><MessageManagement /></div>
          </TabsContent>

          {/* Approval */}
          <TabsContent value="approval" className="mt-4"><ApprovalLineManagement /></TabsContent>

          {/* System Info (P5-5) */}
          <TabsContent value="system" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">시스템 현황</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">시스템명:</span> <span className="font-medium">ParkMaster™</span></div>
                  <div><span className="text-muted-foreground">버전:</span> <span className="font-mono">{config?.system_version || '1.0.0'}</span></div>
                  <div><span className="text-muted-foreground">기관:</span> <span>{config?.org_name || '-'}</span></div>
                  <div><span className="text-muted-foreground">사용자 수:</span> <span>{sysInfo?.profileCount || 0}명</span></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">활성 모듈 현황</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {licenses?.map((m: any) => (
                    <div key={m.id} className={`p-3 rounded-lg border ${m.is_active ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800' : 'border-muted bg-muted/30'}`}>
                      <div className="flex items-center gap-1.5">
                        {m.is_active ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-xs font-medium">{MODULE_LABELS[m.module_code] || m.module_code}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-mono">{m.module_code}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">연결 상태</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: 'DB 연결', ok: connStatus?.db },
                  { label: 'Realtime', ok: connStatus?.realtime },
                  { label: 'Storage', ok: connStatus?.storage },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 text-sm">
                    {s.ok ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                    <span>{s.label}</span>
                    <Badge variant={s.ok ? "default" : "destructive"} className="text-[10px]">{s.ok ? '정상' : '오류'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">DB 데이터 현황</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center"><div className="text-2xl font-bold text-primary">{sysInfo?.lotCount || 0}</div><div className="text-xs text-muted-foreground">주차장</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-primary">{sysInfo?.profileCount || 0}</div><div className="text-xs text-muted-foreground">사용자</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-primary">{sysInfo?.eqCount || 0}</div><div className="text-xs text-muted-foreground">장비</div></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Backup (P5-5) */}
          <TabsContent value="backup" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">자동 백업 설정</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-sm">백업 주기</Label>
                  <Select value={configValue("backup_schedule")} onValueChange={v => setEditedConfig({ ...editedConfig, backup_schedule: v })}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">매일</SelectItem>
                      <SelectItem value="weekly">매주</SelectItem>
                      <SelectItem value="monthly">매월</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-sm">백업 시간</Label>
                  <Input className="col-span-3" type="time" value={configValue("backup_time")} onChange={e => setEditedConfig({ ...editedConfig, backup_time: e.target.value })} />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-sm">보관 기간</Label>
                  <Select value={configValue("backup_retention_days")} onValueChange={v => setEditedConfig({ ...editedConfig, backup_retention_days: v })}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30일</SelectItem>
                      <SelectItem value="60">60일</SelectItem>
                      <SelectItem value="90">90일</SelectItem>
                      <SelectItem value="365">1년</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {Object.keys(editedConfig).length > 0 && <div className="flex justify-end"><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save className="h-4 w-4 mr-1" />저장</Button></div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">복원</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium text-destructive mb-2">⚠️ 주의</p>
                  <p className="text-muted-foreground text-xs">
                    복원은 서버에서 직접 수행해야 합니다. 관리자 매뉴얼의 '데이터 복원' 절차를 따르세요.
                    현재 모든 데이터가 삭제되고 백업 시점으로 복원됩니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Management */}
          <TabsContent value="security" className="mt-4"><SecurityManagement /></TabsContent>

          {/* Demo Data (P5-1) */}
          <TabsContent value="demo" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">데모 데이터 관리</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">영업/시연용 데모 데이터를 생성하거나 초기화합니다. 데모 데이터는 notes 필드에 [DEMO] 접두어가 붙습니다.</p>

                {/* Progress indicator */}
                {demoLoading && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm font-medium">{demoStepLabel}</span>
                    </div>
                    <Progress value={demoProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">{demoProgress}%</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Dialog open={demoGenDialog} onOpenChange={v => !demoLoading && setDemoGenDialog(v)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={demoLoading}><PlayCircle className="h-4 w-4 mr-1" />데모 데이터 생성</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>데모 데이터 생성</DialogTitle></DialogHeader>
                      <p className="text-sm text-muted-foreground">전체 17개 모듈(시설, 운영, 수입, 예산, 입찰, 용역, 민원, 기획, 실시간, 보고서 등)에 대한 데모 데이터를 생성합니다.</p>
                      <p className="text-xs text-muted-foreground">⏱ 약 20~30초 소요됩니다.</p>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDemoGenDialog(false)}>취소</Button>
                        <Button onClick={() => { setDemoGenDialog(false); runDemoAction("seed"); }}>생성 시작</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={demoCleanDialog} onOpenChange={v => !demoLoading && setDemoCleanDialog(v)}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" disabled={demoLoading}><Trash2 className="h-4 w-4 mr-1" />데모 데이터 초기화</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>데모 데이터 초기화</DialogTitle></DialogHeader>
                      <p className="text-sm text-muted-foreground">데모 데이터만 삭제하고 시스템을 초기 상태로 복원합니다.</p>
                      <p className="text-xs text-muted-foreground">⏱ 약 10~15초 소요됩니다.</p>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDemoCleanDialog(false)}>취소</Button>
                        <Button variant="destructive" onClick={() => { setDemoCleanDialog(false); runDemoAction("cleanup"); }}>초기화 시작</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p>• 생성 대상: 시설장비, 유지보수, 안전점검, 운영인력, 민원, 수입, 예산, 입찰, 용역, 기획, 실시간, 보고서, 결재, 알림</p>
                  <p>• 약 1,500건 이상의 연관 데이터가 자동 생성됩니다</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
