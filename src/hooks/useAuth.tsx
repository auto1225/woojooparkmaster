/**
 * 인증 컨텍스트 — 자체 백엔드(/api/auth/*) 기반.
 *
 * Supabase의 supabase.auth.* 호출을 authApi로 교체.
 * 핵심 차이점:
 *   - 토큰은 httpOnly 쿠키로 백엔드가 관리. 클라이언트에서 토큰 직접 노출 안 함
 *   - User 타입은 우리 자체 AuthUser (id, email, name, role, team)
 *   - onAuthStateChange는 supabase가 제공하던 이벤트 모델 → 자체 Context state로 대체
 *   - 다른 탭과의 로그아웃 동기화는 useSessionSync(BroadcastChannel)에서 처리
 */
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authApi, type AuthUser } from "@/integrations/api";
import { profilesApi, type ProfileRow } from "@/integrations/api/profiles";

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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const p = await profilesApi.me();
      setProfile(p);
    } catch {
      setProfile(null);
    }
  };

  const refresh = async () => {
    try {
      const u = await authApi.me();
      setUser(u);
      if (u) await fetchProfile();
      else setProfile(null);
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    // 다른 탭의 로그아웃 메시지 수신
    if (!broadcastChannel) return;
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === "LOGOUT" || event.data?.type === "FORCE_LOGOUT") {
        setUser(null);
        setProfile(null);
      }
    };
    broadcastChannel.addEventListener("message", onMsg);
    return () => broadcastChannel.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const u = await authApi.login(email, password);
      setUser(u);
      await fetchProfile();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setProfile(null);
      // 다른 탭에 알림
      try {
        broadcastChannel?.postMessage({ type: "LOGOUT" });
      } catch {
        /* 채널 닫힘 등 — 무시 */
      }
    }
  };

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
