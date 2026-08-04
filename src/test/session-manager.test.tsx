import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "@/components/common/SessionManager";

const signOut = vi.fn(async () => undefined);

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "session-test-user" },
    signOut,
  }),
}));

describe("SessionManager", () => {
  afterEach(() => {
    signOut.mockClear();
  });

  it("does not duplicate Supabase cross-tab logout handling", () => {
    const view = render(<SessionManager />);

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "parkmaster-logout",
        newValue: Date.now().toString(),
      }));
    });

    expect(signOut).not.toHaveBeenCalled();
    view.unmount();
  });
});
