import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { LayoutDashboard, Car, ClipboardCheck, Settings, BarChart3, Wrench, DollarSign, FileText, Users, Building2, Megaphone, MapPin, PieChart, ChevronLeft, ChevronRight, ChevronDown, CreditCard, Shield, Clock, Scale, UserCheck, HardHat, CalendarCheck, ShieldCheck, PaintBucket, Banknote, Calculator, LineChart, FileSearch, Receipt, ArrowRightLeft, Wallet, CircleDollarSign, BookOpen, Gavel, FolderOpen, FileCheck, Briefcase, ClipboardList, CreditCard as CreditCardIcon, AlertTriangle, Plus, BarChart2, Compass, Landmark, FileImage, ScrollText, Radio, Cpu, Server, Monitor, Key, FileBarChart, CalendarClock, LayoutTemplate, PanelLeftClose, PanelLeftOpen, GripVertical, ExternalLink, GitCompareArrows, ContactRound, Check, RotateCcw } from "lucide-react";
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
import { runtimeConfig } from "@/config/runtime-config";
import { isModuleEnabled } from "@/lib/authorization";

const coreMenuItems = [
  { title: "문서대장", url: "/documents", icon: FileText },
  { title: "팀 업무관리", url: "/team-work", icon: ClipboardList, end: true },
  { title: "업무분장", url: "/team-work/duties", icon: Users },
  { title: "명함관리", url: "/business-cards", icon: ContactRound },
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
  { title: "방치차량 처리", url: "/ops/abandoned-vehicles", icon: Car },
  { title: "관제·보안 점검", url: "/ops/security-inspections", icon: ShieldCheck },
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
  { title: "예산 분석", url: "/budget/analysis", icon: BarChart2 },
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
  { title: "사업 의사결정", url: "/planning/decisions", icon: GitCompareArrows },
  { title: "후보부지", url: "/planning/sites", icon: MapPin },
  { title: "공사 관리", url: "/planning/projects", icon: HardHat },
  { title: "도면 관리", url: "/planning/documents", icon: FileImage },
  { title: "인허가", url: "/planning/permits", icon: ScrollText },
  { title: "사업 행정절차", url: "/planning/procedures", icon: ClipboardList },
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
  { title: "주차장 성과 순위", url: "/reports/ranking", icon: BarChart3 },
  { title: "간부용 현황판", url: "/reports/executive", icon: PieChart },
  { title: "분기 보고서", url: "/reports/print-quarterly", icon: FileBarChart },
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

const MODULE_ORDER_KEY = "parkmaster-module-order";
const CORE_ORDER_KEY = "parkmaster-core-menu-order";
const SUBMENU_ORDER_KEY = "parkmaster-submenu-order";

function storageKey(base: string, ownerId: string) {
  return `${base}:${ownerId}`;
}

function getStoredOrder(key: string, defaults: string[], legacyKey?: string): string[] {
  try {
    const stored = localStorage.getItem(key) || (legacyKey ? localStorage.getItem(legacyKey) : null);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return defaults;
    const valid = parsed.filter((id): id is string => typeof id === "string" && defaults.includes(id));
    const normalized = [...new Set(valid), ...defaults.filter((id) => !valid.includes(id))];
    if (!localStorage.getItem(key) && stored) localStorage.setItem(key, JSON.stringify(normalized));
    return normalized;
  } catch {
    return defaults;
  }
}

function setStoredOrder(key: string, order: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(order));
  } catch {}
}

function getStoredSubmenuOrder(key: string, defaults: Record<string, string[]>) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return Object.fromEntries(Object.entries(defaults).map(([moduleId, ids]) => [
      moduleId,
      Array.isArray(parsed[moduleId])
        ? [...new Set((parsed[moduleId] as unknown[]).filter((id): id is string => typeof id === "string" && ids.includes(id))), ...ids.filter((id) => !(parsed[moduleId] as unknown[]).includes(id))]
        : ids,
    ]));
  } catch {
    return defaults;
  }
}

function mergeVisibleOrder(fullOrder: string[], visibleOrder: string[]) {
  const visible = new Set(visibleOrder);
  let visibleIndex = 0;
  const merged = fullOrder.map((id) => visible.has(id) ? visibleOrder[visibleIndex++] : id);
  return [...merged, ...visibleOrder.filter((id) => !merged.includes(id))];
}

// Sortable wrapper component
function SortableModuleItem({ id, label, children, editing }: { id: string; label: string; children: React.ReactNode; editing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group/sortable relative ${editing ? "rounded-lg ring-1 ring-inset ring-white/10" : ""}`}>
      {children}
      {editing && (
        <button
          type="button"
          className="absolute inset-x-0 top-0 z-30 flex h-11 cursor-grab items-center justify-end rounded-lg px-3 text-sidebar-foreground/70 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 active:cursor-grabbing"
          aria-label={`${label} 드래그하여 순서 변경`}
          title="드래그하여 순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function SortableSubmenuItem({ id, label, children, editing }: { id: string; label: string; children: React.ReactNode; editing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={editing ? "relative rounded-lg ring-1 ring-inset ring-white/10" : "relative"}>
      {children}
      {editing && (
        <button
          type="button"
          className="absolute inset-0 z-30 flex cursor-grab items-center justify-end rounded-lg px-2 text-sidebar-foreground/70 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 active:cursor-grabbing"
          aria-label={`${label} 드래그하여 순서 변경`}
          title="드래그하여 순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

let sidebarScrollTop = 0;

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, user } = useAuth();
  const { data: licenses } = useModuleLicenses();
  const scrollRef = useRef<HTMLDivElement>(null);
  const ownerId = user?.id || profile?.id || "local";
  const moduleOrderStorageKey = storageKey(MODULE_ORDER_KEY, ownerId);
  const coreOrderStorageKey = storageKey(CORE_ORDER_KEY, ownerId);
  const submenuOrderStorageKey = storageKey(SUBMENU_ORDER_KEY, ownerId);
  const defaultModuleOrder = useMemo(() => ALL_MODULES.map((module) => module.id), []);
  const defaultCoreOrder = useMemo(() => coreMenuItems.map((item) => item.url), []);
  const defaultSubmenuOrder = useMemo(() => Object.fromEntries(ALL_MODULES.filter((module) => module.subMenu).map((module) => [module.id, module.subMenu!.map((item) => item.url)])), []);
  const [editingMenuOrder, setEditingMenuOrder] = useState(false);

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
    ALL_MODULES.forEach((module) => {
      if (isModuleEnabled(licenses, module.licenseKey)) set.add(module.id);
    });
    return set;
  }, [licenses]);

  // Module order with DnD
  const [moduleOrder, setModuleOrder] = useState<string[]>(() => getStoredOrder(moduleOrderStorageKey, defaultModuleOrder, MODULE_ORDER_KEY));
  const [coreOrder, setCoreOrder] = useState<string[]>(() => getStoredOrder(coreOrderStorageKey, defaultCoreOrder));
  const [submenuOrders, setSubmenuOrders] = useState<Record<string, string[]>>(() => getStoredSubmenuOrder(submenuOrderStorageKey, defaultSubmenuOrder));

  useEffect(() => {
    setModuleOrder(getStoredOrder(moduleOrderStorageKey, defaultModuleOrder, MODULE_ORDER_KEY));
    setCoreOrder(getStoredOrder(coreOrderStorageKey, defaultCoreOrder));
    setSubmenuOrders(getStoredSubmenuOrder(submenuOrderStorageKey, defaultSubmenuOrder));
  }, [coreOrderStorageKey, defaultCoreOrder, defaultModuleOrder, defaultSubmenuOrder, moduleOrderStorageKey, submenuOrderStorageKey]);

  const orderedCoreItems = useMemo(() => {
    const itemMap = new Map(coreMenuItems.map((item) => [item.url, item]));
    return coreOrder.map((id) => itemMap.get(id)).filter((item): item is (typeof coreMenuItems)[number] => Boolean(item));
  }, [coreOrder]);

  const orderedModules = useMemo(() => {
    const moduleMap = new Map(ALL_MODULES.map((m) => [m.id, m]));
    const ordered: ModuleDef[] = [];
    // First add items in stored order
    for (const id of moduleOrder) {
      const mod = moduleMap.get(id);
      if (mod && activeModuleIds.has(mod.id)) {
        ordered.push(mod);
      }
    }
    // Then add any new modules not in stored order
    for (const mod of ALL_MODULES) {
      if (activeModuleIds.has(mod.id) && !moduleOrder.includes(mod.id)) {
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
      const visibleOrder = arrayMove(orderedModules.map((m) => m.id), oldIndex, newIndex);
      const newOrder = mergeVisibleOrder(moduleOrder, visibleOrder);
      setModuleOrder(newOrder);
      setStoredOrder(moduleOrderStorageKey, newOrder);
    }
  };

  const handleCoreDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = coreOrder.indexOf(String(active.id));
    const newIndex = coreOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(coreOrder, oldIndex, newIndex);
    setCoreOrder(next);
    setStoredOrder(coreOrderStorageKey, next);
  };

  const handleSubmenuDragEnd = (moduleId: string, visibleOrder: string[], event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleOrder.indexOf(String(active.id));
    const newIndex = visibleOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setSubmenuOrders((current) => {
      const next = { ...current, [moduleId]: arrayMove(visibleOrder, oldIndex, newIndex) };
      try { localStorage.setItem(submenuOrderStorageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const resetMenuOrder = () => {
    setCoreOrder(defaultCoreOrder);
    setModuleOrder(defaultModuleOrder);
    setSubmenuOrders(defaultSubmenuOrder);
    setStoredOrder(coreOrderStorageKey, defaultCoreOrder);
    setStoredOrder(moduleOrderStorageKey, defaultModuleOrder);
    try { localStorage.setItem(submenuOrderStorageKey, JSON.stringify(defaultSubmenuOrder)); } catch {}
  };

  const isAdmin = profile?.role === "admin";
  // 센서 관제 콘솔(외부) URL — 환경변수로 오버라이드 가능
  const SENSOR_CONSOLE_URL = runtimeConfig.sensorConsoleUrl;
  // Sensor Monitoring 메뉴 노출 허용 계정(내 계정만). 이메일은 소문자 비교.
  const SENSOR_CONSOLE_EMAILS = ["cmh@woojoocha.com"];
  const canSeeConsole = Boolean(SENSOR_CONSOLE_URL)
    && SENSOR_CONSOLE_EMAILS.includes(((user?.email || profile?.email || "").toLowerCase()));

  // 외부 링크 메뉴(새 탭) — 관리자 전용 Sensor Monitoring 콘솔용
  const renderExternal = (item: { title: string; href: string; icon: any }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={item.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150">
                <item.icon className="h-[18px] w-[18px] shrink-0" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          <a href={item.href} target="_blank" rel="noopener noreferrer"
            className="flex items-center text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150 py-3 px-3">
            <item.icon className="mr-2.5 h-[20px] w-[20px] shrink-0" />
            <span className="text-[17px]">{item.title}</span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-50 shrink-0" />
          </a>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const renderLink = (item: { title: string; url: string; icon: any; end?: boolean }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink to={item.url} end={item.end}
                className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150"
                activeClassName="bg-white/[0.14] !text-white border-l-[3px] border-l-white shadow-sm">
                <item.icon className="h-[18px] w-[18px] shrink-0" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          <NavLink to={item.url} end={item.end}
            className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg transition-all duration-150 py-3 px-3"
            activeClassName="bg-white/[0.14] !text-white border-l-[3px] border-l-white shadow-sm font-semibold">
            <item.icon className="mr-2.5 h-[20px] w-[20px] shrink-0" />
            <span className="text-[17px]">{item.title}</span>
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
    const subMenuMap = new Map(mod.subMenu.map((item) => [item.url, item]));
    const orderedSubMenu = (submenuOrders[mod.id] || mod.subMenu.map((item) => item.url)).map((id) => subMenuMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleOpen(mod.id)}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton className="text-sidebar-foreground hover:bg-white/[0.08] hover:text-white rounded-lg w-full justify-between py-3 px-3 transition-all duration-150">
              <div className="flex items-center">
                <Icon className="mr-2.5 h-[20px] w-[20px] shrink-0" />
                <span className="text-[17px]">{mod.label}</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleSubmenuDragEnd(mod.id, orderedSubMenu.map((item) => item.url), event)}>
              <SortableContext items={orderedSubMenu.map((item) => item.url)} strategy={verticalListSortingStrategy}>
                <SidebarMenu className="ml-[18px] border-l border-white/[0.08] pl-3 mt-1 space-y-0.5">
                  {orderedSubMenu.map((item) => (
                    <SortableSubmenuItem key={item.url} id={item.url} label={item.title} editing={editingMenuOrder}>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink to={item.url} end={item.end}
                            className="text-sidebar-foreground hover:text-white hover:bg-white/[0.06] rounded-lg py-2.5 px-2.5 pr-8 transition-all duration-150"
                            activeClassName="!text-white bg-white/[0.12] border-l-2 border-l-white/90 font-semibold">
                            <span className="text-[16px]">{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SortableSubmenuItem>
                  ))}
                </SidebarMenu>
              </SortableContext>
            </DndContext>
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
        {!collapsed && <div className="mb-2 flex items-center justify-end gap-1 px-2"><Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-sidebar-foreground hover:bg-white/10 hover:text-white" onClick={() => setEditingMenuOrder((value) => !value)}>{editingMenuOrder ? <Check className="mr-1.5 h-4 w-4" /> : <GripVertical className="mr-1.5 h-4 w-4" />}{editingMenuOrder ? "순서 변경 완료" : "메뉴 순서 변경"}</Button>{editingMenuOrder && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground hover:bg-white/10 hover:text-white" aria-label="메뉴 순서 기본값 복원" title="기본값 복원" onClick={resetMenuOrder}><RotateCcw className="h-4 w-4" /></Button>}</div>}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[15px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground px-3 mb-1.5">메인</SidebarGroupLabel>
          <SidebarGroupContent>
            {collapsed ? <SidebarMenu className="space-y-0.5">{orderedCoreItems.map(renderLink)}</SidebarMenu> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCoreDragEnd}><SortableContext items={orderedCoreItems.map((item) => item.url)} strategy={verticalListSortingStrategy}><SidebarMenu className="space-y-0.5">{orderedCoreItems.map((item) => <SortableModuleItem key={item.url} id={item.url} label={item.title} editing={editingMenuOrder}>{renderLink(item)}</SortableModuleItem>)}</SidebarMenu></SortableContext></DndContext>}
          </SidebarGroupContent>
        </SidebarGroup>

        {orderedModules.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[15px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground px-3 mb-1.5">모듈</SidebarGroupLabel>
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
                        <SortableModuleItem key={mod.id} id={mod.id} label={mod.label} editing={editingMenuOrder}>
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

        {canSeeConsole && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[15px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground px-3 mb-1.5">센서 관제</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">{renderExternal({ title: "Sensor Monitoring", href: SENSOR_CONSOLE_URL, icon: Monitor })}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[15px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground px-3 mb-1.5">시스템</SidebarGroupLabel>
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
