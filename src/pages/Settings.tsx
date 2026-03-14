import { useState } from "react";
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
import { toast } from "sonner";
import { Settings, Shield, Package, Save, MessageSquare, GitBranch, Sparkles } from "lucide-react";
import MessageManagement from "@/pages/settings/MessageManagement";
import ApprovalLineManagement from "@/pages/settings/ApprovalLineManagement";

export default function SettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: config } = useSystemConfig();
  const { data: licenses } = useModuleLicenses();
  const [editedConfig, setEditedConfig] = useState<Record<string, string>>({});

  const isAdmin = profile?.role === "admin";

  const configValue = (key: string) => editedConfig[key] ?? config?.[key] ?? "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(editedConfig)) {
        const { error } = await supabase
          .from("system_config")
          .update({ config_value: value })
          .eq("config_key", key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-config"] });
      setEditedConfig({});
      toast.success("설정이 저장되었습니다");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ code, active }: { code: string; active: boolean }) => {
      const { error } = await supabase
        .from("module_licenses")
        .update({ is_active: active, activated_at: active ? new Date().toISOString() : null })
        .eq("module_code", code);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-licenses"] });
      toast.success("모듈 상태가 변경되었습니다");
    },
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
    { key: "org_name", label: "기관명" },
    { key: "org_code", label: "기관코드" },
    { key: "org_address", label: "기관 주소" },
    { key: "org_phone", label: "전화번호" },
    { key: "admin_email", label: "관리자 이메일" },
    { key: "map_center_lat", label: "지도 중심 위도" },
    { key: "map_center_lng", label: "지도 중심 경도" },
    { key: "map_zoom", label: "지도 줌 레벨" },
    { key: "kakao_map_appkey", label: "카카오 맵 API 키" },
  ];

  const AI_TOGGLE_KEY = "ai_enabled";
  const MSG_TOGGLES = [
    { key: "alimtalk_enabled", label: "카카오 알림톡" },
    { key: "sms_enabled", label: "SMS 발송" },
  ];

  const MODULE_LABELS: Record<string, string> = {
    CORE: "코어",
    SURVEY: "현황조사",
    OPS: "운영관리",
    FACILITY: "시설관리",
    REVENUE: "수입관리",
    BUDGET: "예산관리",
    PROCUREMENT: "입찰관리",
    SERVICE: "용역사업관리",
    COMPLAINT: "민원관리",
    PLANNING: "신설기획",
    REALTIME: "실시간 정보",
    REPORT: "보고서/통계",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">시스템 설정</h1>
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">기본 설정</TabsTrigger>
            <TabsTrigger value="modules">모듈 관리</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="h-3 w-3 mr-1" />AI 설정</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="h-3 w-3 mr-1" />메시지</TabsTrigger>
            <TabsTrigger value="approval"><GitBranch className="h-3 w-3 mr-1" />결재선</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">기관 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {CONFIG_FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right text-sm">{f.label}</Label>
                    <Input
                      className="col-span-3"
                      value={configValue(f.key)}
                      onChange={(e) => setEditedConfig({ ...editedConfig, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={Object.keys(editedConfig).length === 0 || saveMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-1" />저장
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modules" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" />모듈 라이선스 관리
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>모듈 코드</TableHead>
                      <TableHead>모듈명</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>활성화일</TableHead>
                      <TableHead>만료일</TableHead>
                      <TableHead>활성/비활성</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses?.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.module_code}</TableCell>
                        <TableCell className="text-sm">{MODULE_LABELS[m.module_code] || m.module_code}</TableCell>
                        <TableCell>
                          <Badge className={m.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}>
                            {m.is_active ? "활성" : "비활성"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{m.activated_at ? new Date(m.activated_at).toLocaleDateString("ko-KR") : "-"}</TableCell>
                        <TableCell className="text-xs">{m.expires_at ? new Date(m.expires_at).toLocaleDateString("ko-KR") : "-"}</TableCell>
                        <TableCell>
                          <Switch
                            checked={m.is_active}
                            onCheckedChange={(checked) => toggleModuleMutation.mutate({ code: m.module_code, active: checked })}
                            disabled={m.module_code === "CORE"}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">AI 기능 설정</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">AI 기능 활성화</p>
                    <p className="text-xs text-muted-foreground">민원 자동분류, 보고서 총평, 수입 분석 등 AI 기능을 사용합니다</p>
                  </div>
                  <Switch
                    checked={configValue(AI_TOGGLE_KEY) === 'true'}
                    onCheckedChange={(v) => setEditedConfig({ ...editedConfig, [AI_TOGGLE_KEY]: v ? 'true' : 'false' })}
                  />
                </div>
                {Object.keys(editedConfig).length > 0 && (
                  <div className="flex justify-end">
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      <Save className="h-4 w-4 mr-1" />저장
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">메시지 발송 설정</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {MSG_TOGGLES.map(t => (
                  <div key={t.key} className="flex items-center justify-between">
                    <Label className="text-sm">{t.label}</Label>
                    <Switch
                      checked={configValue(t.key) === 'true'}
                      onCheckedChange={(v) => setEditedConfig({ ...editedConfig, [t.key]: v ? 'true' : 'false' })}
                    />
                  </div>
                ))}
                {Object.keys(editedConfig).length > 0 && (
                  <div className="flex justify-end">
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      <Save className="h-4 w-4 mr-1" />저장
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="mt-4">
              <MessageManagement />
            </div>
          </TabsContent>

          <TabsContent value="approval" className="mt-4">
            <ApprovalLineManagement />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
