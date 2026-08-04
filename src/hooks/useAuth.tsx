import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";
import { getSessionIdentity } from "@/lib/session-identity";

interface AuthContextType {
  user: AuthUser | null;
  profile: ProfileRow | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /** 외부에서 강제 갱신 (예: 비밀번호 변경 후) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 다른 탭과 로그아웃 동기화용 채널 (한 번만 생성)
const broadcastChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("parkmaster-auth") : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setProfile(data as unknown as Profile);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setSessionToken(session?.access_token ? getSessionIdentity(session.access_token) : null);
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionToken(session?.access_token ? getSessionIdentity(session.access_token) : null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  useEffect(() => {
    if (!user || !sessionToken) return;
    let cancelled = false;
    const endManagedSession = async (reason: "session_expired" | "session_revoked") => {
      await supabase.auth.signOut();
      if (!cancelled) window.location.replace(`/login?reason=${reason}`);
    };
    const enforceSessionState = async () => {
      const { data, error } = await (supabase.from("active_sessions") as any)
        .select("is_active, expires_at")
        .eq("user_id", user.id)
        .eq("session_token", sessionToken)
        .maybeSingle();
      if (cancelled || error || !data) return;
      if (!data.is_active) await endManagedSession("session_revoked");
      else if (data.expires_at && new Date(data.expires_at) <= new Date()) {
        await endManagedSession("session_expired");
      }
    };

    void enforceSessionState();
    const interval = window.setInterval(enforceSessionState, 30_000);
    const channel = supabase
      .channel(`session-control-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "active_sessions", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          if (payload.new?.session_token === sessionToken && payload.new?.is_active === false) {
            void endManagedSession("session_revoked");
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [sessionToken, user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSessionToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
