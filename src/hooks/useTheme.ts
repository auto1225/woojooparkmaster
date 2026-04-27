import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/api/supabase-compat";
import { useAuth } from "@/hooks/useAuth";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "parkmaster-theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Theme) || "light";
  });

  // Apply on mount and changes
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // Save to profile
    if (user) {
      supabase.from("profiles").update({ theme_preference: t } as any).eq("id", user.id).then();
    }
  }, [user]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const isDark = theme === "system" ? getSystemTheme() === "dark" : theme === "dark";

  return { theme, setTheme, toggleTheme, isDark };
}
