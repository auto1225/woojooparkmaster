import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Car, ClipboardCheck, Bell, Menu } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "홈", path: "/", icon: LayoutDashboard, module: "CORE" },
  { label: "주차장", path: "/lots", icon: Car, module: "CORE" },
  { label: "조사", path: "/surveys", icon: ClipboardCheck, module: "SURVEY" },
  { label: "알림", path: "/notifications", icon: Bell, module: "CORE" },
];

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: licenses } = useModuleLicenses();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isMobile) return null;

  const activeModules = new Set(
    (licenses ?? []).filter((m) => m.is_active).map((m) => m.module_code)
  );
  activeModules.add("CORE");

  const visibleItems = NAV_ITEMS.filter((item) => activeModules.has(item.module));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-14 bg-card border-t flex items-center justify-around px-1 safe-area-bottom">
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
  );
}
