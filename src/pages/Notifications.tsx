import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Info, AlertTriangle, XCircle, CheckCircle, Bell, BellOff, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TYPE_ICONS: Record<string, { icon: any; color: string }> = {
  info: { icon: Info, color: "text-blue-500 bg-blue-100" },
  warning: { icon: AlertTriangle, color: "text-orange-500 bg-orange-100" },
  error: { icon: XCircle, color: "text-red-500 bg-red-100" },
  approval: { icon: CheckCircle, color: "text-purple-500 bg-purple-100" },
  success: { icon: Check, color: "text-green-500 bg-green-100" },
};

const MODULE_LABELS: Record<string, string> = {
  CORE: "주차장", SURVEY: "조사", OPS: "운영", FACILITY: "시설",
  REVENUE: "수입", BUDGET: "예산", PROCUREMENT: "입찰", SERVICE: "용역",
  COMPLAINT: "민원", REALTIME: "실시간",
};

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function Notifications() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [readTab, setReadTab] = useState("unread");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);

  // Fetch notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["all-notifications", user?.id, readTab, moduleFilter],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (readTab === "unread") q = q.eq("is_read", false);
      else if (readTab === "read") q = q.eq("is_read", true);

      if (moduleFilter !== "all") q = q.eq("module", moduleFilter);

      const { data } = await q;
      return data || [];
    },
    enabled: !!user,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase.from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_read", false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
      toast.success("모두 읽음 처리됨");
    },
  });

  // Notification settings
  const settings = (profile as any)?.notification_settings || {};

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ notification_settings: newSettings } as any).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-user"] });
      toast.success("알림 설정 저장됨");
    },
  });

  const toggleSetting = (key: string) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    updateSettingsMutation.mutate(newSettings);
  };

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("my-notifications")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        toast.info(payload.new.title, { description: payload.new.message });
        queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });

        // Browser notification
        if (settings.browser_notification !== false && Notification.permission === "granted") {
          new Notification(payload.new.title, { body: payload.new.message, icon: "/icons/icon-192.png" });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleNotifClick = (notif: any) => {
    if (!notif.is_read) markReadMutation.mutate(notif.id);
    if (notif.link) navigate(notif.link);
  };

  const requestBrowserPermission = async () => {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      toast.success("브라우저 알림이 허용되었습니다");
      updateSettingsMutation.mutate({ ...settings, browser_notification: true });
    } else {
      toast.error("브라우저 알림이 거부되었습니다");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold">알림 센터</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => markAllReadMutation.mutate()}>모두 읽음</Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? "목록 보기" : "알림 설정"}
            </Button>
          </div>
        </div>

        {showSettings ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-sm font-semibold">모듈별 알림 설정</h2>
              {NOTIF_SETTINGS_KEYS.map((s) => (
                <div key={s.key} className="flex items-center justify-between">
                  <Label className="text-sm">{s.label}</Label>
                  <Switch checked={settings[s.key] !== false} onCheckedChange={() => toggleSetting(s.key)} />
                </div>
              ))}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">긴급만 받기</Label>
                  <Switch checked={settings.urgent_only === true} onCheckedChange={() => toggleSetting("urgent_only")} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">브라우저 알림</Label>
                  <div className="flex gap-2 items-center">
                    <Switch checked={settings.browser_notification !== false} onCheckedChange={() => toggleSetting("browser_notification")} />
                    {Notification.permission !== "granted" && (
                      <Button size="sm" variant="outline" onClick={requestBrowserPermission}>권한 요청</Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex gap-3 flex-wrap items-center">
              <Tabs value={readTab} onValueChange={setReadTab}>
                <TabsList>
                  <TabsTrigger value="unread">안읽음</TabsTrigger>
                  <TabsTrigger value="read">읽음</TabsTrigger>
                  <TabsTrigger value="all">전체</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 모듈</SelectItem>
                  {Object.entries(MODULE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {notifications.map((n: any) => {
                const typeInfo = TYPE_ICONS[n.type] || TYPE_ICONS.info;
                const Icon = typeInfo.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`w-full text-left p-3 rounded-lg border flex gap-3 items-start transition-colors hover:bg-muted/50 ${!n.is_read ? "bg-primary/5 border-primary/20" : ""}`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                      {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                  </button>
                );
              })}
              {notifications.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <BellOff className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  알림이 없습니다
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
