import { useState } from "react";
import { LayoutDashboard, Car, ClipboardCheck, Settings, BarChart3, Wrench, DollarSign, FileText, Users, Building2, Megaphone, MapPin, PieChart, ChevronLeft, ChevronRight, ChevronDown, CreditCard, Shield, Clock, Scale, UserCheck, HardHat, CalendarCheck, ShieldCheck, PaintBucket, Banknote, Calculator, LineChart, FileSearch, Receipt, ArrowRightLeft, Wallet, CircleDollarSign, BookOpen } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const coreMenuItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard, end: true },
  { title: "주차장 관리", url: "/lots", icon: Car },
];

const opsSubMenu = [
  { title: "운영 현황", url: "/ops", icon: BarChart3, end: true },
  { title: "인력 관리", url: "/ops/staff", icon: UserCheck },
  { title: "위탁 계약", url: "/ops/contracts", icon: FileText },
  { title: "요금 정책", url: "/ops/fees", icon: DollarSign },
  { title: "감면 관리", url: "/ops/exemptions", icon: Scale },
  { title: "월정기권", url: "/ops/passes", icon: CreditCard },
  { title: "단속 기록", url: "/ops/enforcement", icon: Shield },
  { title: "무료개방", url: "/ops/free-hours", icon: Clock },
];

const facilitySubMenu = [
  { title: "시설 현황", url: "/facility", icon: Wrench, end: true },
  { title: "장비 관리", url: "/facility/equipment", icon: HardHat },
  { title: "유지보수", url: "/facility/maintenance", icon: Building2 },
  { title: "점검 스케줄", url: "/facility/schedule", icon: CalendarCheck },
  { title: "안전점검", url: "/facility/safety", icon: ShieldCheck },
  { title: "노면표시", url: "/facility/markings", icon: PaintBucket },
];

const revenueSubMenu = [
  { title: "수입 현황", url: "/revenue", icon: Banknote, end: true },
  { title: "일별 수입", url: "/revenue/daily", icon: Calculator },
  { title: "위탁 대사", url: "/revenue/reconcile", icon: FileSearch },
  { title: "수입 분석", url: "/revenue/analysis", icon: LineChart },
];

const budgetSubMenu = [
  { title: "예산 현황", url: "/budget", icon: Wallet, end: true },
  { title: "예산 편성", url: "/budget/plans", icon: BookOpen },
  { title: "예산 집행", url: "/budget/executions", icon: CircleDollarSign },
  { title: "예산 전용/이체", url: "/budget/transfers", icon: ArrowRightLeft },
];

const simpleModuleMap: Record<string, { title: string; url: string; icon: any }> = {
  SURVEY: { title: "현황조사", url: "/surveys", icon: ClipboardCheck },
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
  const [opsOpen, setOpsOpen] = useState(true);
  const [facilityOpen, setFacilityOpen] = useState(true);
  const [revenueOpen, setRevenueOpen] = useState(true);
  const [budgetOpen, setBudgetOpen] = useState(true);
  const activeModules = (licenses ?? []).filter((m) => m.is_active && !["CORE", "OPS", "FACILITY", "REVENUE", "BUDGET"].includes(m.module_code));
  const opsActive = (licenses ?? []).some((m) => m.module_code === "OPS" && m.is_active);
  const facilityActive = (licenses ?? []).some((m) => m.module_code === "FACILITY" && m.is_active);
  const revenueActive = (licenses ?? []).some((m) => m.module_code === "REVENUE" && m.is_active);
  const budgetActive = (licenses ?? []).some((m) => m.module_code === "BUDGET" && m.is_active);
  const simpleModules = activeModules.map((m) => simpleModuleMap[m.module_code]).filter(Boolean);
  const isAdmin = profile?.role === "admin";

  const renderLink = (item: { title: string; url: string; icon: any; end?: boolean }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        <NavLink to={item.url} end={item.end}
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
          activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium">
          <item.icon className="mr-2 h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm">{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

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
          <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-[0.1em] text-sidebar-foreground/40 px-2">메인</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{coreMenuItems.map(renderLink)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        {(simpleModules.length > 0 || opsActive || facilityActive) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-[0.1em] text-sidebar-foreground/40 px-2">모듈</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {simpleModules.map(renderLink)}

                {opsActive && !collapsed && (
                  <Collapsible open={opsOpen} onOpenChange={setOpsOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md w-full justify-between">
                          <div className="flex items-center">
                            <Building2 className="mr-2 h-4 w-4 shrink-0" />
                            <span className="text-sm">운영관리</span>
                          </div>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${opsOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenu className="ml-4 border-l border-sidebar-border pl-2 mt-1">
                          {opsSubMenu.map(renderLink)}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {opsActive && collapsed && renderLink({ title: "운영관리", url: "/ops", icon: Building2 })}

                {facilityActive && !collapsed && (
                  <Collapsible open={facilityOpen} onOpenChange={setFacilityOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md w-full justify-between">
                          <div className="flex items-center">
                            <Wrench className="mr-2 h-4 w-4 shrink-0" />
                            <span className="text-sm">시설관리</span>
                          </div>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${facilityOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenu className="ml-4 border-l border-sidebar-border pl-2 mt-1">
                          {facilitySubMenu.map(renderLink)}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {facilityActive && collapsed && renderLink({ title: "시설관리", url: "/facility", icon: Wrench })}

                {revenueActive && !collapsed && (
                  <Collapsible open={revenueOpen} onOpenChange={setRevenueOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md w-full justify-between">
                          <div className="flex items-center">
                            <Banknote className="mr-2 h-4 w-4 shrink-0" />
                            <span className="text-sm">수입관리</span>
                          </div>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${revenueOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenu className="ml-4 border-l border-sidebar-border pl-2 mt-1">
                          {revenueSubMenu.map(renderLink)}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {revenueActive && collapsed && renderLink({ title: "수입관리", url: "/revenue", icon: Banknote })}

                {budgetActive && !collapsed && (
                  <Collapsible open={budgetOpen} onOpenChange={setBudgetOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md w-full justify-between">
                          <div className="flex items-center">
                            <Wallet className="mr-2 h-4 w-4 shrink-0" />
                            <span className="text-sm">예산관리</span>
                          </div>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${budgetOpen ? "rotate-180" : ""}`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenu className="ml-4 border-l border-sidebar-border pl-2 mt-1">
                          {budgetSubMenu.map(renderLink)}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {budgetActive && collapsed && renderLink({ title: "예산관리", url: "/budget", icon: Wallet })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-[0.1em] text-sidebar-foreground/40 px-2">시스템</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderLink({ title: "시스템 설정", url: "/settings", icon: Settings })}</SidebarMenu>
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
        <Button variant="ghost" size="sm" onClick={toggleSidebar} className="w-full justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
