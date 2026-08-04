import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessCards from "@/pages/BusinessCards";

vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { role: "admin" } }) }));
vi.mock("@/lib/business-card-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/business-card-registry")>();
  return {
    ...actual,
    listBusinessCards: vi.fn().mockResolvedValue([]),
    listBusinessCardLinkOptions: vi.fn().mockResolvedValue([]),
    getBusinessCardImageUrl: vi.fn().mockResolvedValue(""),
    saveBusinessCard: vi.fn(),
    archiveBusinessCard: vi.fn(),
    restoreBusinessCard: vi.fn(),
  };
});

describe("contact and business card registration", () => {
  beforeEach(() => vi.clearAllMocks());

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}><MemoryRouter><BusinessCards /></MemoryRouter></QueryClientProvider>);
  }

  it("opens a manual contact form without business card fields", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "연락처 등록" }));
    expect(screen.getByRole("heading", { name: "연락처 등록" })).toBeInTheDocument();
    expect(screen.getByText(/명함이 없어도 담당자 연락처를 직접 등록/)).toBeInTheDocument();
    expect(screen.queryByLabelText("명함 이미지")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연락처 저장" })).toBeInTheDocument();
  });

  it("keeps photo and OCR controls in the business card flow", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "명함 촬영 등록" }));
    expect(screen.getByRole("heading", { name: "명함 촬영 등록" })).toBeInTheDocument();
    expect(screen.getByLabelText("명함 이미지")).toHaveAttribute("type", "file");
    expect(screen.getByRole("button", { name: "명함 저장" })).toBeInTheDocument();
  });
});
