import { useState, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import { LayoutDashboard, Car, ClipboardCheck, Settings, BarChart3, Wrench, DollarSign, FileText, Users, Building2, Megaphone, MapPin, PieChart, ChevronLeft, ChevronRight, ChevronDown, CreditCard, Shield, Clock, Scale, UserCheck, HardHat, CalendarCheck, ShieldCheck, PaintBucket, Banknote, Calculator, LineChart, FileSearch, Receipt, ArrowRightLeft, Wallet, CircleDollarSign, BookOpen, Gavel, FolderOpen, FileCheck, Briefcase, ClipboardList, CreditCard as CreditCardIcon, AlertTriangle, Plus, BarChart2, Compass, Landmark, FileImage, ScrollText, Radio, Cpu, Server, Monitor, Key, FileBarChart, CalendarClock, LayoutTemplate, PanelLeftClose, PanelLeftOpen, GripVertical } from "lucide-react";
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
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// Module definitions with stable IDs for DnD
type ModuleDef = {
  id: string;
  type: "simple" | "collapsible";
  label: string;
  icon: any;
  url?: string;
  subMenu?: Array<{ title: string; url: string; icon: any; end?: boolean }>;
  licenseKey: string;
};

const ALL_MODULES: ModuleDef[] = [
  { id: "SURVEY", type: "simple", label: "현황조사", icon: ClipboardCheck, url: "/surveys", licenseKey: "SURVEY" },
  { id: "OPS", type: "collapsible", label: "운영관리", icon: Building2, subMenu: opsSubMenu, licenseKey: "OPS" },
  { id: "FACILITY", type: "collapsible", label: "시설관리", icon: Wrench, subMenu: facilitySubMenu, licenseKey: "FACILITY" },
  { id: "REVENUE", type: "collapsible", label: "수입관리", icon: Banknote, subMenu: revenueSubMenu, licenseKey: "REVENUE" },
  { id: "BUDGET", type: "collapsible", label: "예산관리", icon: Wallet, subMenu: budgetSubMenu, licenseKey: "BUDGET" },
  { id: "PROCUREMENT", type: "collapsible", label: "입찰관리", icon: Gavel, subMenu: procurementSubMenu, licenseKey: "PROCUREMENT" },
  { id: "SERVICE", type: "collapsible", label: "용역사업관리", icon: Briefcase, subMenu: serviceSubMenu, licenseKey: "SERVICE" },
  { id: "COMPLAINT", type: "collapsible", label: "민원관리", icon: Megaphone, subMenu: complaintSubMenu, licenseKey: "COMPLAINT" },
  { id: "PLANNING", type: "collapsible", label: "신설기획", icon: Compass, subMenu: planningSubMenu, licenseKey: "PLANNING" },
  { id: "REALTIME", type: "collapsible", label: "실시간 정보", icon: Radio, subMenu: realtimeSubMenu, licenseKey: "REALTIME" },
  { id: "REPORT", type: "collapsible", label: "보고서/통계", icon: FileBarChart, subMenu: reportSubMenu, licenseKey: "REPORT" },
];

const STORAGE_KEY = "parkmaster-module-order";

function getStoredOrder(): string[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setStoredOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

// Sortable wrapper component
function SortableModuleItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group/sortable">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover/sortable:opacity-60 transition-opacity cursor-grab z-10" {...listeners}>
        <GripVertical className="h-3.5 w-3.5 text-sidebar-foreground/50" />
      </div>
      {children}
    </div>
  );
}

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

  const [openStates, setOpenStates] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("parkmaster-menu-open");
      if (stored) return JSON.parse(stored);
    } catch {}
    return {
      OPS: true, FACILITY: true, REVENUE: true, BUDGET: true,
      PROCUREMENT: true, SERVICE: true, COMPLAINT: true, PLANNING: true,
      REALTIME: true, REPORT: true,
    };
  });

  const toggleOpen = (id: string) => setOpenStates((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    try { localStorage.setItem("parkmaster-menu-open", JSON.stringify(next)); } catch {}
    return next;
  });

  // Active modules
  const activeModuleIds = useMemo(() => {
    const set = new Set<string>();
    (licenses ?? []).forEach((m) => {
      if (m.is_active) set.add(m.module_code);
    });
    return set;
  }, [licenses]);

  // Module order with DnD
  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    const stored = getStoredOrder();
    if (stored) return stored;
    return ALL_MODULES.map((m) => m.id);
  });

  const orderedModules = useMemo(() => {
    const moduleMap = new Map(ALL_MODULES.map((m) => [m.id, m]));
    const ordered: ModuleDef[] = [];
    // First add items in stored order
    for (const id of moduleOrder) {
      const mod = moduleMap.get(id);
      if (mod && activeModuleIds.has(mod.licenseKey)) {
        ordered.push(mod);
      }
    }
    // Then add any new modules not in stored order
    for (const mod of ALL_MODULES) {
      if (activeModuleIds.has(mod.licenseKey) && !moduleOrder.includes(mod.id)) {
        ordered.push(mod);
      }
    }
    return ordered;
  }, [moduleOrder, activeModuleIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderedModules.findIndex((m) => m.id === active.id);
      const newIndex = orderedModules.findIndex((m) => m.id === over.id);
      const newOrder = arrayMove(orderedModules.map((m) => m.id), oldIndex, newIndex);
      setModuleOrder(newOrder);
      setStoredOrder(newOrder);
    }
  };

  const isAdmin = profile?.role === "admin";

  const renderLink = (item: { title: string; url: string; icon: any; end?: boolean }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink to={item.url} end={item.end}
                className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150"
                activeClassName="bg-primary/20 text-primary-foreground border-l-[3px] border-l-primary shadow-[0_0_12px_rgba(30,86,224,0.15)]">
                <item.icon className="h-[18px] w-[18px] shrink-0" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          <NavLink to={item.url} end={item.end}
            className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150 py-2.5 px-3"
            activeClassName="bg-primary/20 !text-[hsl(var(--sidebar-primary))] border-l-[3px] border-l-primary shadow-[0_0_12px_rgba(30,86,224,0.15)] font-semibold">
            <item.icon className="mr-2.5 h-[20px] w-[20px] shrink-0" />
            <span className="text-[16px]">{item.title}</span>
          </NavLink>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const renderCollapsible = (mod: ModuleDef) => {
    if (!mod.subMenu) return null;
    if (collapsed) return renderLink({ title: mod.label, url: mod.subMenu[0].url, icon: mod.icon });
    const Icon = mod.icon;
    const isOpen = openStates[mod.id] ?? true;
    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleOpen(mod.id)}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg w-full justify-between py-2.5 px-3 transition-all duration-150">
              <div className="flex items-center">
                <Icon className="mr-2.5 h-[20px] w-[20px] shrink-0" />
                <span className="text-[16px]">{mod.label}</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu className="ml-[18px] border-l border-white/[0.08] pl-3 mt-1 space-y-0.5">
              {mod.subMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.end}
                     className="text-sidebar-foreground hover:text-white hover:bg-white/[0.06] rounded-lg py-2 px-2.5 transition-all duration-150"
                      activeClassName="!text-[hsl(var(--sidebar-primary))] bg-primary/10 border-l-2 border-l-primary font-semibold">
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
          <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/70 px-3 mb-1">메인</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu className="space-y-0.5">{coreMenuItems.map(renderLink)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>

        {orderedModules.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/70 px-3 mb-1">모듈</SidebarGroupLabel>
            <SidebarGroupContent>
              {collapsed ? (
                <SidebarMenu className="space-y-0.5">
                  {orderedModules.map((mod) =>
                    mod.type === "simple"
                      ? renderLink({ title: mod.label, url: mod.url!, icon: mod.icon })
                      : renderCollapsible(mod)
                  )}
                </SidebarMenu>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={orderedModules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <SidebarMenu className="space-y-0.5">
                      {orderedModules.map((mod) => (
                        <SortableModuleItem key={mod.id} id={mod.id}>
                          {mod.type === "simple"
                            ? renderLink({ title: mod.label, url: mod.url!, icon: mod.icon })
                            : renderCollapsible(mod)}
                        </SortableModuleItem>
                      ))}
                    </SidebarMenu>
                  </SortableContext>
                </DndContext>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/70 px-3 mb-1">시스템</SidebarGroupLabel>
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
