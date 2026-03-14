import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-4 border-b px-6 shrink-0">
            <SidebarTrigger />
            {title && (
              <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground">
                {new Date().toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })}
              </span>
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                <span className="text-[10px] font-medium text-primary-foreground">A</span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
