import { LayoutDashboard, Car, ClipboardCheck, Settings, BarChart3, Wrench, DollarSign, FileText, Users, Building2, Megaphone, MapPin, PieChart, ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const coreMenuItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard, end: true },
  { title: "주차장 관리", url: "/lots", icon: Car },
];

const moduleMenuMap: Record<string, { title: string; url: string; icon: any }> = {
  SURVEY: { title: "현황조사", url: "/surveys", icon: ClipboardCheck },
  OPS: { title: "운영관리", url: "/ops", icon: Building2 },
  FACILITY: { title: "시설관리", url: "/facility", icon: Wrench },
  REVENUE: { title: "수입관리", url: "/revenue", icon: DollarSign },
  BUDGET: { title: "예산관리", url: "/budget", icon: BarChart3 },
  PROCUREMENT: { title: "입찰관리", url: "/procurement", icon: FileText },
  SERVICE: { title: "용역사업관리", url: "/service", icon: Users },
  COMPLAINT: { title: "민원관리", url: "/complaint", icon: Megaphone },
  PLANNING: { title: "신설기획", url: "/planning", icon: MapPin },
  REALTIME: { title: "실시간 정보", url: "/realtime", icon: PieChart },
  REPORT: { title: "보고서/통계", url: "/report", icon: BarChart3 },
};

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile } = useAuth();
  const { data: licenses } = useModuleLicenses();

  const activeModules = (licenses ?? [])
    .filter((m) => m.is_active && m.module_code !== "CORE")
    .map((m) => moduleMenuMap[m.module_code])
    .filter(Boolean);

  const isAdmin = profile?.role === "admin";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary shrink-0">
            <span className="text-sm font-bold text-sidebar-primary-foreground font-mono">P</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">ParkMaster</span>
              <span className="text-[10px] text-sidebar-foreground/60">공영주차장 통합관리</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-[0.1em] text-sidebar-foreground/40 px-2">
            메인
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {coreMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.end}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {activeModules.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-[0.1em] text-sidebar-foreground/40 px-2">
              모듈
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {activeModules.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
                        activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-[0.1em] text-sidebar-foreground/40 px-2">
              시스템
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/settings"
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    >
                      <Settings className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">시스템 설정</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {profile && !collapsed && (
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-sidebar-accent-foreground">{profile.name?.[0] || "U"}</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-sidebar-primary-foreground truncate">{profile.name}</span>
              <span className="text-[10px] text-sidebar-foreground/50 truncate">{profile.department || profile.team}</span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
