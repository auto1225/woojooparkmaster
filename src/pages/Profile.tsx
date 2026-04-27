import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { authApi } from "@/integrations/api";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { User, Lock, Sun, Moon, Monitor, Bell, Activity, Check, X, Eye, EyeOff } from "lucide-react";
import { PhoneInput } from "@/components/common/PhoneInput";

const PASSWORD_CHECKS = [
  { label: "8자 이상", test: (p: string) => p.length >= 8 },
  { label: "대문자 포함", test: (p: string) => /[A-Z]/.test(p) },
  { label: "숫자 포함", test: (p: string) => /[0-9]/.test(p) },
  { label: "특수문자 포함", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const NOTIF_SETTINGS_KEYS = [
  { key: "survey", label: "현황조사 알림" },
  { key: "ops", label: "운영관리 알림" },
  { key: "facility", label: "시설관리 알림" },
  { key: "revenue", label: "수입관리 알림" },
  { key: "budget", label: "예산관리 알림" },
  { key: "procurement", label: "입찰관리 알림" },
  { key: "service", label: "용역관리 알림" },
  { key: "complaint", label: "민원관리 알림" },
  { key: "realtime", label: "실시간 알림" },
];

export default function Profile() {
  const { user, profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState((profile as any)?.phone || "");
  const [employeeNumber, setEmployeeNumber] = useState((profile as any)?.employee_number || "");
  const [department, setDepartment] = useState((profile as any)?.department || "");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const notifSettings = (profile as any)?.notification_settings || {};

  // Profile update
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("profiles").update({
        name,
        phone,
        employee_number: employeeNumber,
        department,
      } as any).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-user"] });
      toast.success("프로필이 저장되었습니다");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Password change
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error("비밀번호가 일치하지 않습니다");
      // 자체 인증: 현재 비밀번호 입력 검증 필요 (Profile UI에 currentPassword 입력 추가 필요)
      if (!currentPassword) throw new Error("현재 비밀번호를 입력하세요");
      await authApi.changePassword(currentPassword, newPassword);
    },
    onSuccess: () => {
      toast.success("비밀번호가 변경되었습니다");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Notification settings
  const updateNotifMutation = useMutation({
    mutationFn: async (settings: any) => {
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ notification_settings: settings } as any).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-user"] }),
  });

  const toggleNotif = (key: string) => {
    const newSettings = { ...notifSettings, [key]: !notifSettings[key] };
    updateNotifMutation.mutate(newSettings);
  };

  // Recent activity
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["profile-activity", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user,
  });

  const passedChecks = PASSWORD_CHECKS.filter((c) => c.test(newPassword)).length;
  const strengthColor = passedChecks <= 1 ? "bg-destructive" : passedChecks <= 2 ? "bg-warning" : passedChecks <= 3 ? "bg-warning" : "bg-success";
  const strengthLabel = passedChecks <= 1 ? "약함" : passedChecks <= 3 ? "보통" : "강함";

  const initials = (profile?.name || "U").slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-bold">내 프로필</h1>

        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />프로필 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                {initials}
              </div>
              <div>
                <p className="font-semibold">{profile?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <Badge variant="outline" className="mt-1 text-[10px]">{profile?.role}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>이름</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>이메일</Label><Input value={user?.email || ""} disabled className="opacity-60" /></div>
              <div><Label>직원번호</Label><Input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} /></div>
              <div><Label>전화번호</Label><PhoneInput value={phone} onChange={setPhone} /></div>
              <div><Label>부서</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
              <div><Label>팀</Label><Input value={(profile as any)?.team || ""} disabled className="opacity-60" /></div>
            </div>
            <Button size="sm" onClick={() => updateProfileMutation.mutate()} disabled={updateProfileMutation.isPending}>
              저장
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4" />비밀번호 변경</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Label>새 비밀번호</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8자 이상"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {newPassword && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${strengthColor} transition-all`} style={{ width: `${(passedChecks / 4) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{strengthLabel}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {PASSWORD_CHECKS.map((c) => (
                    <div key={c.label} className={`flex items-center gap-1 text-[11px] ${c.test(newPassword) ? "text-success" : "text-muted-foreground"}`}>
                      {c.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {c.label}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div>
              <Label>비밀번호 확인</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[11px] text-destructive mt-1">비밀번호가 일치하지 않습니다</p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => changePasswordMutation.mutate()}
              disabled={passedChecks < 4 || newPassword !== confirmPassword || changePasswordMutation.isPending}
            >
              비밀번호 변경
            </Button>
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Sun className="h-4 w-4" />테마 설정</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="light" id="theme-light" />
                <Label htmlFor="theme-light" className="flex items-center gap-2 cursor-pointer"><Sun className="h-4 w-4" />라이트</Label>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="dark" id="theme-dark" />
                <Label htmlFor="theme-dark" className="flex items-center gap-2 cursor-pointer"><Moon className="h-4 w-4" />다크</Label>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="system" id="theme-system" />
                <Label htmlFor="theme-system" className="flex items-center gap-2 cursor-pointer"><Monitor className="h-4 w-4" />시스템 자동</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" />알림 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {NOTIF_SETTINGS_KEYS.map((s) => (
              <div key={s.key} className="flex items-center justify-between">
                <Label className="text-sm">{s.label}</Label>
                <Switch checked={notifSettings[s.key] !== false} onCheckedChange={() => toggleNotif(s.key)} />
              </div>
            ))}
            <Separator />
            <div className="flex items-center justify-between">
              <Label className="text-sm">긴급만 받기</Label>
              <Switch checked={notifSettings.urgent_only === true} onCheckedChange={() => toggleNotif("urgent_only")} />
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />최근 활동</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">최근 활동이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground font-mono w-28 shrink-0">
                      {a.created_at ? new Date(a.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                    </span>
                    <Badge variant="outline" className="text-[9px]">{a.module}</Badge>
                    <span>{a.action}</span>
                    <span className="text-muted-foreground truncate">{a.target_name || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
