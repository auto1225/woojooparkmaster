import { useState, useRef, useCallback, useLayoutEffect } from "react";
import { LayoutDashboard, Car, ClipboardCheck, Settings, BarChart3, Wrench, DollarSign, FileText, Users, Building2, Megaphone, MapPin, PieChart, ChevronLeft, ChevronRight, ChevronDown, CreditCard, Shield, Clock, Scale, UserCheck, HardHat, CalendarCheck, ShieldCheck, PaintBucket, Banknote, Calculator, LineChart, FileSearch, Receipt, ArrowRightLeft, Wallet, CircleDollarSign, BookOpen, Gavel, FolderOpen, FileCheck, Briefcase, ClipboardList, CreditCard as CreditCardIcon, AlertTriangle, Plus, BarChart2, Compass, Landmark, FileImage, ScrollText, Radio, Cpu, Server, Monitor, Key, FileBarChart, CalendarClock, LayoutTemplate, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const coreMenuItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard, end: true },
  { title: "종합 현황", url: "/master", icon: PanelLeftOpen },
  { title: "결재함", url: "/approvals", icon: ClipboardCheck },
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

const procurementSubMenu = [
  { title: "입찰 현황", url: "/procurement", icon: Gavel, end: true },
  { title: "입찰 사업", url: "/procurement/projects", icon: FileText },
  { title: "계약 관리", url: "/procurement/contracts", icon: FileCheck },
  { title: "서류 관리", url: "/procurement/documents", icon: FolderOpen },
];

const serviceSubMenu = [
  { title: "용역 현황", url: "/service", icon: Briefcase, end: true },
  { title: "사업 관리", url: "/service/projects", icon: FileText },
  { title: "검수 관리", url: "/service/inspections", icon: ClipboardList },
  { title: "대가지급", url: "/service/payments", icon: Banknote },
  { title: "이슈 관리", url: "/service/issues", icon: AlertTriangle },
];

const complaintSubMenu = [
  { title: "민원 현황", url: "/complaints", icon: Megaphone, end: true },
  { title: "민원 접수", url: "/complaints/new", icon: Plus },
  { title: "민원 통계", url: "/complaints/stats", icon: BarChart2 },
];

const planningSubMenu = [
  { title: "기획 현황", url: "/planning", icon: Compass, end: true },
  { title: "후보부지", url: "/planning/sites", icon: MapPin },
  { title: "공사 관리", url: "/planning/projects", icon: HardHat },
  { title: "도면 관리", url: "/planning/documents", icon: FileImage },
  { title: "인허가", url: "/planning/permits", icon: ScrollText },
];

const realtimeSubMenu = [
  { title: "실시간 현황", url: "/realtime", icon: Radio, end: true },
  { title: "센서 모니터링", url: "/realtime/sensors", icon: Cpu },
  { title: "게이트웨이", url: "/realtime/gateways", icon: Server },
  { title: "전광판 관리", url: "/realtime/displays", icon: Monitor },
  { title: "API 관리", url: "/realtime/api", icon: Key },
];

const reportSubMenu = [
  { title: "보고서 센터", url: "/reports", icon: FileBarChart, end: true },
  { title: "보고서 생성", url: "/reports/generate", icon: Plus },
  { title: "보고서 이력", url: "/reports/history", icon: FileText },
  { title: "스케줄 관리", url: "/reports/schedules", icon: CalendarClock },
  { title: "대시보드 빌더", url: "/reports/dashboard-builder", icon: LayoutTemplate },
];

const simpleModuleMap: Record<string, { title: string; url: string; icon: any }> = {
  SURVEY: { title: "현황조사", url: "/surveys", icon: ClipboardCheck },
  FACILITY: { title: "시설관리", url: "/facility", icon: Wrench },
  REVENUE: { title: "수입관리", url: "/revenue", icon: DollarSign },
  BUDGET: { title: "예산관리", url: "/budget", icon: BarChart3 },
  PROCUREMENT: { title: "입찰관리", url: "/procurement", icon: FileText },
  SERVICE: { title: "용역사업관리", url: "/service", icon: Users },
  PLANNING: { title: "신설기획", url: "/planning", icon: MapPin },
  REALTIME: { title: "실시간 정보", url: "/realtime", icon: Radio },
  REPORT: { title: "보고서/통계", url: "/reports", icon: FileBarChart },
};

let sidebarScrollTop = 0;

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) sidebarScrollTop = scrollRef.current.scrollTop;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const restore = () => { el.scrollTop = sidebarScrollTop; };
    restore();
    const raf = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(raf);
  }, []);

  const [opsOpen, setOpsOpen] = useState(true);
  const [facilityOpen, setFacilityOpen] = useState(true);
  const [revenueOpen, setRevenueOpen] = useState(true);
  const [budgetOpen, setBudgetOpen] = useState(true);
  const [procurementOpen, setProcurementOpen] = useState(true);
  const [serviceOpen, setServiceOpen] = useState(true);
  const [complaintOpen, setComplaintOpen] = useState(true);
  const [planningOpen, setPlanningOpen] = useState(true);
  const [realtimeOpen, setRealtimeOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(true);

  const activeModules = (licenses ?? []).filter((m) => m.is_active && !["CORE", "OPS", "FACILITY", "REVENUE", "BUDGET", "PROCUREMENT", "SERVICE", "COMPLAINT", "PLANNING", "REALTIME", "REPORT"].includes(m.module_code));
  const opsActive = (licenses ?? []).some((m) => m.module_code === "OPS" && m.is_active);
  const facilityActive = (licenses ?? []).some((m) => m.module_code === "FACILITY" && m.is_active);
  const revenueActive = (licenses ?? []).some((m) => m.module_code === "REVENUE" && m.is_active);
  const budgetActive = (licenses ?? []).some((m) => m.module_code === "BUDGET" && m.is_active);
  const procurementActive = (licenses ?? []).some((m) => m.module_code === "PROCUREMENT" && m.is_active);
  const serviceActive = (licenses ?? []).some((m) => m.module_code === "SERVICE" && m.is_active);
  const complaintActive = (licenses ?? []).some((m) => m.module_code === "COMPLAINT" && m.is_active);
  const planningActive = (licenses ?? []).some((m) => m.module_code === "PLANNING" && m.is_active);
  const realtimeActive = (licenses ?? []).some((m) => m.module_code === "REALTIME" && m.is_active);
  const reportActive = (licenses ?? []).some((m) => m.module_code === "REPORT" && m.is_active);
  const simpleModules = activeModules.map((m) => simpleModuleMap[m.module_code]).filter(Boolean);
  const isAdmin = profile?.role === "admin";

  const renderLink = (item: { title: string; url: string; icon: any; end?: boolean }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink to={item.url} end={item.end}
                className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150"
                activeClassName="bg-primary/15 text-white border-l-[3px] border-l-primary shadow-[0_0_12px_rgba(30,86,224,0.1)]">
                <item.icon className="h-[18px] w-[18px] shrink-0" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          <NavLink to={item.url} end={item.end}
            className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150 py-2.5 px-3"
            activeClassName="bg-primary/15 text-white border-l-[3px] border-l-primary shadow-[0_0_12px_rgba(30,86,224,0.1)] font-medium">
            <item.icon className="mr-2.5 h-[18px] w-[18px] shrink-0" />
            <span className="text-[15px]">{item.title}</span>
          </NavLink>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const renderCollapsible = (
    label: string, icon: any, isOpen: boolean, setOpen: (v: boolean) => void,
    subMenu: Array<{ title: string; url: string; icon: any; end?: boolean }>, isActive: boolean,
  ) => {
    if (!isActive) return null;
    if (collapsed) return renderLink({ title: label, url: subMenu[0].url, icon });
    const Icon = icon;
    return (
      <Collapsible open={isOpen} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg w-full justify-between py-2.5 px-3 transition-all duration-150">
              <div className="flex items-center">
                <Icon className="mr-2.5 h-[18px] w-[18px] shrink-0" />
                <span className="text-[15px]">{label}</span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu className="ml-[18px] border-l border-white/[0.08] pl-3 mt-1 space-y-0.5">
              {subMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.end}
                     className="text-sidebar-foreground hover:text-white hover:bg-white/[0.06] rounded-lg py-2 px-2.5 transition-all duration-150"
                      activeClassName="text-white bg-primary/10 border-l-2 border-l-primary font-medium">
                      <span className="text-[14px]">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Logo header */}
      <SidebarHeader className="border-b border-white/[0.06] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0">
            <span className="text-sm font-bold text-white font-display">P</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm tracking-tight">
                <span className="font-light text-white/90">Park</span>
                <span className="font-bold text-primary">Master</span>
              </span>
              <span className="text-[10px] text-sidebar-foreground/50">공영주차장 통합관리</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Scrollable menu area */}
      <SidebarContent ref={scrollRef} onScroll={handleScroll} className="px-2 pt-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/40 px-3 mb-1">메인</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu className="space-y-0.5">{coreMenuItems.map(renderLink)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        {(simpleModules.length > 0 || opsActive || facilityActive) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/40 px-3 mb-1">모듈</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {simpleModules.map(renderLink)}
                {renderCollapsible("운영관리", Building2, opsOpen, setOpsOpen, opsSubMenu, opsActive)}
                {renderCollapsible("시설관리", Wrench, facilityOpen, setFacilityOpen, facilitySubMenu, facilityActive)}
                {renderCollapsible("수입관리", Banknote, revenueOpen, setRevenueOpen, revenueSubMenu, revenueActive)}
                {renderCollapsible("예산관리", Wallet, budgetOpen, setBudgetOpen, budgetSubMenu, budgetActive)}
                {renderCollapsible("입찰관리", Gavel, procurementOpen, setProcurementOpen, procurementSubMenu, procurementActive)}
                {renderCollapsible("용역사업관리", Briefcase, serviceOpen, setServiceOpen, serviceSubMenu, serviceActive)}
                {renderCollapsible("민원관리", Megaphone, complaintOpen, setComplaintOpen, complaintSubMenu, complaintActive)}
                {renderCollapsible("신설기획", Compass, planningOpen, setPlanningOpen, planningSubMenu, planningActive)}
                {renderCollapsible("실시간 정보", Radio, realtimeOpen, setRealtimeOpen, realtimeSubMenu, realtimeActive)}
                {renderCollapsible("보고서/통계", FileBarChart, reportOpen, setReportOpen, reportSubMenu, reportActive)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/40 px-3 mb-1">시스템</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">{renderLink({ title: "시스템 설정", url: "/settings", icon: Settings })}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer with user profile */}
      <SidebarFooter className="border-t border-white/[0.06] p-3">
        {profile && !collapsed && (
          <div className="flex items-center gap-2.5 mb-3 px-1">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-white">{profile.name?.[0] || "U"}</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-white/90 truncate">{profile.name}</span>
              <span className="text-[10px] text-sidebar-foreground/40 truncate">{profile.department || profile.team}</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={toggleSidebar}
            className="text-sidebar-foreground/40 hover:text-white hover:bg-white/[0.06] rounded-lg h-8 w-8 p-0">
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          {!collapsed && (
            <a href="/settings" className="text-[10px] text-sidebar-foreground/20 hover:text-sidebar-foreground/50 font-mono transition-colors">
              v1.0.0
            </a>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
