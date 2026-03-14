import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { Bell, LogOut, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";

const ROUTE_TITLES: Record<string, string> = {
  "/": "대시보드",
  "/lots": "주차장 관리",
  "/lots/new": "주차장 등록",
  "/settings": "시스템 설정",
  "/survey": "현황조사",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const { data: config } = useSystemConfig();
  const navigate = useNavigate();
  const location = useLocation();

  const pageTitle = ROUTE_TITLES[location.pathname] ||
    (location.pathname.startsWith("/lots/") && location.pathname !== "/lots/new" ? "주차장 상세" : "");

  const { data: unreadNotifs } = useQuery({
    queryKey: ["unread-notifications", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  });

  const markAsRead = async (id: string, link?: string) => {
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    if (link) navigate(link);
  };

  const markAllRead = async () => {
    if (!profile?.id) return;
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("user_id", profile.id).eq("is_read", false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const orgName = config?.org_name || "";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-4 border-b bg-card px-4 sm:px-6 shrink-0">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight">{pageTitle}</h1>
              {orgName && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {orgName}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/approvals")} title="결재함">
                <ClipboardCheck className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadNotifs && unreadNotifs.length > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-destructive">
                        {unreadNotifs.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="border-b px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold">알림</span>
                    {unreadNotifs && unreadNotifs.length > 0 && (
                      <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={markAllRead}>모두 읽음</Button>
                    )}
                    <Link to="/notifications" className="text-[10px] text-primary hover:underline">전체 보기</Link>
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {(!unreadNotifs || unreadNotifs.length === 0) ? (
                      <div className="px-4 py-6 text-center text-xs text-muted-foreground">새 알림이 없습니다</div>
                    ) : (
                      unreadNotifs.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markAsRead(n.id, n.link || undefined)}
                          className="w-full text-left px-4 py-2.5 hover:bg-muted border-b last:border-b-0"
                        >
                          <div className="text-xs font-medium">{n.title}</div>
                          {n.message && <div className="text-[10px] text-muted-foreground mt-0.5">{n.message}</div>}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground hidden sm:block">{profile?.name}</span>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="로그아웃">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-auto bg-background pb-20 md:pb-6">
            {children}
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
