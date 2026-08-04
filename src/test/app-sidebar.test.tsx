import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "sidebar-test-user", email: "sidebar@example.com" },
    profile: { id: "sidebar-test-user", name: "테스트 관리자", role: "admin", department: "차량관리과" },
  }),
}));

vi.mock("@/hooks/useSystemConfig", () => ({
  useModuleLicenses: () => ({ data: [] }),
}));

vi.mock("@/lib/authorization", () => ({
  isModuleEnabled: () => true,
}));

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <TooltipProvider>
        <SidebarProvider defaultOpen>
          <AppSidebar />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar information architecture", () => {
  it("orders the groups as main, modules, other, and system settings", () => {
    const { container } = renderSidebar();
    const labels = Array.from(container.querySelectorAll('[data-sidebar="group-label"]')).map((element) => element.textContent);

    expect(labels).toEqual(["메인", "모듈", "기타", "시스템 설정"]);
    expect(screen.getByRole("link", { name: "연락처/명함관리" })).toHaveAttribute("href", "/business-cards");
  });

  it("keeps simple and collapsible top-level menu labels on the same grid", () => {
    const { container } = renderSidebar();
    const dashboard = container.querySelector('a[href="/"]');
    const survey = container.querySelector('a[href="/surveys"]');
    const operations = screen.getByRole("button", { name: "운영관리" });

    expect(dashboard).toHaveClass("gap-2.5", "border-l-[3px]", "border-l-white");
    expect(survey).toHaveClass("gap-2.5", "border-l-[3px]", "border-l-transparent");
    expect(operations).toHaveClass("border-l-[3px]", "border-l-transparent");
  });

  it("opens and closes drag ordering from the other group", () => {
    renderSidebar();
    const editButton = screen.getByRole("button", { name: "메뉴 순서 변경" });

    fireEvent.click(editButton);
    expect(screen.getByRole("button", { name: "순서 변경 완료" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "기본 순서 복원" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "순서 변경 완료" }));
    expect(screen.getByRole("button", { name: "메뉴 순서 변경" })).toHaveAttribute("aria-pressed", "false");
  });
});
