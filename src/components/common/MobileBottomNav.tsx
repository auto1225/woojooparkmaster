import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Car, ClipboardCheck, Bell, Menu, Wrench, Banknote, Megaphone, Radio, FileBarChart, Gavel, Briefcase, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { isModuleEnabled } from "@/lib/authorization";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "홈", path: "/", icon: LayoutDashboard, module: "CORE" },
  { label: "주차장", path: "/lots", icon: Car, module: "CORE" },
  { label: "조사", path: "/surveys", icon: ClipboardCheck, module: "SURVEY" },
  { label: "알림", path: "/notifications", icon: Bell, module: "CORE" },
];

const MORE_ITEMS = [
  { label: "운영관리", path: "/ops", icon: Users, module: "OPS" },
  { label: "시설관리", path: "/facility", icon: Wrench, module: "FACILITY" },
  { label: "수입관리", path: "/revenue", icon: Banknote, module: "REVENUE" },
  { label: "입찰관리", path: "/procurement", icon: Gavel, module: "PROCUREMENT" },
  { label: "용역관리", path: "/service", icon: Briefcase, module: "SERVICE" },
  { label: "민원관리", path: "/complaints", icon: Megaphone, module: "COMPLAINT" },
  { label: "실시간", path: "/realtime", icon: Radio, module: "REALTIME" },
  { label: "보고서", path: "/reports", icon: FileBarChart, module: "REPORT" },
];

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isMobile) return null;

  const activeModules = new Set(
    [...NAV_ITEMS, ...MORE_ITEMS]
      .filter((item) => item.module === "CORE" || isModuleEnabled(licenses, item.module))
      .map((item) => item.module)
  );
  activeModules.add("CORE");

  const visibleItems = NAV_ITEMS.filter((item) => activeModules.has(item.module));

  return (
    <>
    <nav className="relative z-50 h-14 shrink-0 bg-card border-t flex items-center justify-around px-1 safe-area-bottom">
      {visibleItems.map((item) => {
        const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button
        onClick={() => setMoreOpen(true)}
        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] text-muted-foreground"
      >
        <Menu className="h-5 w-5" />
        <span>더보기</span>
      </button>
    </nav>
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetContent side="bottom" className="pb-20">
        <SheetHeader><SheetTitle>업무 메뉴</SheetTitle></SheetHeader>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {MORE_ITEMS.filter((item) => activeModules.has(item.module)).map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => { setMoreOpen(false); navigate(item.path); }}
              className="flex min-h-20 flex-col items-center justify-center gap-2 border bg-card p-2 text-center text-xs hover:bg-muted/50"
            >
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
