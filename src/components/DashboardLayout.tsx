import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { Bell, LogOut, ClipboardCheck, Sun, Moon, User, Settings, Search, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { ScrollToTop } from "@/components/common/ScrollToTop";
import { useTheme } from "@/hooks/useTheme";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

const BREADCRUMB_MAP: Record<string, { label: string; parent?: string }> = {
  "/": { label: "대시보드" },
  "/lots": { label: "주차장 관리" },
  "/lots/new": { label: "등록", parent: "/lots" },
  "/approvals": { label: "결재함" },
  "/surveys": { label: "현황조사" },
  "/ops": { label: "운영관리" },
  "/ops/staff": { label: "인력 관리", parent: "/ops" },
  "/ops/contracts": { label: "위탁 계약", parent: "/ops" },
  "/ops/fees": { label: "요금 정책", parent: "/ops" },
  "/ops/exemptions": { label: "감면 관리", parent: "/ops" },
  "/ops/passes": { label: "월정기권", parent: "/ops" },
  "/ops/enforcement": { label: "단속 기록", parent: "/ops" },
  "/ops/free-hours": { label: "무료개방", parent: "/ops" },
  "/facility": { label: "시설관리" },
  "/facility/equipment": { label: "장비 관리", parent: "/facility" },
  "/facility/maintenance": { label: "유지보수", parent: "/facility" },
  "/facility/schedule": { label: "점검 스케줄", parent: "/facility" },
  "/facility/safety": { label: "안전점검", parent: "/facility" },
  "/facility/markings": { label: "노면표시", parent: "/facility" },
  "/revenue": { label: "수입관리" },
  "/revenue/daily": { label: "일별 수입", parent: "/revenue" },
  "/revenue/reconcile": { label: "위탁 대사", parent: "/revenue" },
  "/revenue/analysis": { label: "수입 분석", parent: "/revenue" },
  "/budget": { label: "예산관리" },
  "/budget/plans": { label: "예산 편성", parent: "/budget" },
  "/budget/executions": { label: "예산 집행", parent: "/budget" },
  "/budget/transfers": { label: "예산 전용/이체", parent: "/budget" },
  "/procurement": { label: "입찰관리" },
  "/procurement/projects": { label: "입찰 사업", parent: "/procurement" },
  "/procurement/contracts": { label: "계약 관리", parent: "/procurement" },
  "/procurement/documents": { label: "서류 관리", parent: "/procurement" },
  "/service": { label: "용역사업관리" },
  "/service/projects": { label: "사업 관리", parent: "/service" },
  "/service/inspections": { label: "검수 관리", parent: "/service" },
  "/service/payments": { label: "대가지급", parent: "/service" },
  "/service/issues": { label: "이슈 관리", parent: "/service" },
  "/complaints": { label: "민원관리" },
  "/complaints/new": { label: "민원 접수", parent: "/complaints" },
  "/complaints/stats": { label: "민원 통계", parent: "/complaints" },
  "/planning": { label: "신설기획" },
  "/planning/sites": { label: "후보부지", parent: "/planning" },
  "/planning/projects": { label: "공사 관리", parent: "/planning" },
  "/planning/documents": { label: "도면 관리", parent: "/planning" },
  "/planning/permits": { label: "인허가", parent: "/planning" },
  "/realtime": { label: "실시간 정보" },
  "/realtime/sensors": { label: "센서", parent: "/realtime" },
  "/realtime/gateways": { label: "게이트웨이", parent: "/realtime" },
  "/realtime/displays": { label: "전광판", parent: "/realtime" },
  "/realtime/api": { label: "API", parent: "/realtime" },
  "/realtime/monitor": { label: "관제", parent: "/realtime" },
  "/reports": { label: "보고서/통계" },
  "/reports/generate": { label: "보고서 생성", parent: "/reports" },
  "/reports/history": { label: "보고서 이력", parent: "/reports" },
  "/reports/schedules": { label: "스케줄", parent: "/reports" },
  "/reports/dashboard-builder": { label: "대시보드 빌더", parent: "/reports" },
  "/settings": { label: "시스템 설정" },
  "/profile": { label: "내 프로필" },
  "/notifications": { label: "알림" },
  "/help": { label: "도움말" },
};

function getBreadcrumbs(pathname: string) {
  const crumbs: Array<{ label: string; path: string }> = [];
  const entry = BREADCRUMB_MAP[pathname];
  if (!entry) {
    // try parent path matching
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const parentPath = "/" + segments.slice(0, -1).join("/");
      const parentEntry = BREADCRUMB_MAP[parentPath];
      if (parentEntry) {
        if (parentEntry.parent) {
          const gpEntry = BREADCRUMB_MAP[parentEntry.parent];
          if (gpEntry) crumbs.push({ label: gpEntry.label, path: parentEntry.parent });
        }
        crumbs.push({ label: parentEntry.label, path: parentPath });
      }
      crumbs.push({ label: "상세", path: pathname });
    }
    return crumbs;
  }
  // build chain
  const chain: Array<{ label: string; path: string }> = [];
  let current: string | undefined = pathname;
  while (current) {
    const e = BREADCRUMB_MAP[current];
    if (e) {
      chain.unshift({ label: e.label, path: current });
      current = e.parent;
    } else break;
  }
  return chain;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const { data: config } = useSystemConfig();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const isAdmin = profile?.role === "admin";

  const breadcrumbs = getBreadcrumbs(location.pathname);

  const { data: unreadNotifs } = useQuery({
    queryKey: ["unread-notifications", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("notifications").select("*")
        .eq("user_id", profile.id).eq("is_read", false)
        .order("created_at", { ascending: false }).limit(5);
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

  // Open global search with Cmd+K
  const handleSearchClick = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  const initials = profile?.name ? profile.name.slice(0, 2) : "U";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Premium Header */}
          <header className="h-14 flex items-center gap-3 border-b border-border/60 bg-card px-4 sm:px-6 shrink-0 shadow-xs">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

            {/* Back button */}
            {location.pathname !== "/" && (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 rounded-lg hover:bg-sunken shrink-0" title="뒤로가기">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 min-w-0">
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                  {i === breadcrumbs.length - 1 ? (
                    <span className="text-sm font-semibold text-foreground truncate">{crumb.label}</span>
                  ) : (
                    <Link to={crumb.path} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate">
                      {crumb.label}
                    </Link>
                  )}
                </div>
              ))}
            </nav>

            {/* Right action bar */}
            <div className="ml-auto flex items-center gap-1">
              {/* Search trigger */}
              {!isMobile ? (
                <button
                  onClick={handleSearchClick}
                  className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-sunken text-muted-foreground text-xs hover:border-primary/30 transition-colors w-[180px]"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>검색...</span>
                  <kbd className="ml-auto text-[10px] font-mono bg-card border rounded px-1 py-0.5">⌘K</kbd>
                </button>
              ) : (
                <Button variant="ghost" size="icon" onClick={handleSearchClick} className="h-9 w-9 rounded-lg hover:bg-sunken">
                  <Search className="h-4 w-4" />
                </Button>
              )}

              {/* Approvals */}
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-sunken relative" onClick={() => navigate("/approvals")}>
                <ClipboardCheck className="h-[18px] w-[18px]" />
              </Button>

              {/* Notifications */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-sunken relative">
                    <Bell className="h-[18px] w-[18px]" />
                    {unreadNotifs && unreadNotifs.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center text-[9px] font-mono font-bold bg-primary text-white rounded-full">
                        {unreadNotifs.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 rounded-xl shadow-premium-xl border" align="end">
                  <div className="border-b px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold">알림</span>
                    {unreadNotifs && unreadNotifs.length > 0 && (
                      <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={markAllRead}>모두 읽음</Button>
                    )}
                    <Link to="/notifications" className="text-[10px] text-primary hover:underline">전체 보기</Link>
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {(!unreadNotifs || unreadNotifs.length === 0) ? (
                      <div className="px-4 py-8 text-center text-xs text-muted-foreground">새 알림이 없습니다</div>
                    ) : (
                      unreadNotifs.map((n) => (
                        <button key={n.id} onClick={() => markAsRead(n.id, n.link || undefined)}
                          className="w-full text-left px-4 py-2.5 hover:bg-sunken border-b last:border-b-0 transition-colors">
                          <div className="text-xs font-medium">{n.title}</div>
                          {n.message && <div className="text-[10px] text-muted-foreground mt-0.5">{n.message}</div>}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Theme toggle */}
              <Button variant="ghost" size="icon" onClick={toggleTheme}
                className="h-9 w-9 rounded-lg hover:bg-sunken transition-all duration-300 active:scale-95">
                {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </Button>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 rounded-lg hover:bg-sunken gap-2 px-2 hidden sm:flex">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-white">{initials}</span>
                    </div>
                    <span className="text-xs font-medium">{profile?.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-premium-xl">
                  <DropdownMenuLabel className="flex items-center gap-3 py-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-white">{initials}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{profile?.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{profile?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <User className="mr-2 h-4 w-4" /> 내 프로필
                  </DropdownMenuItem>
                  {isAdmin && <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="mr-2 h-4 w-4" /> 시스템 설정</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> 로그아웃
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon" onClick={handleSignOut} title="로그아웃" className="sm:hidden h-9 w-9 rounded-lg hover:bg-sunken">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 p-5 sm:p-8 overflow-auto bg-background pb-20 md:pb-8">
            {children}
          </main>
          <MobileBottomNav />
          <ScrollToTop />
        </div>
      </div>
    </SidebarProvider>
  );
}
