/**
 * SEC-WEB-4: 멀티탭 세션 동기화.
 *
 * useAuth의 signOut이 BroadcastChannel로 LOGOUT 메시지를 발송하면
 * 다른 탭의 이 hook이 받아서 로그인 페이지로 리다이렉트한다.
 *
 * supabase.auth.onAuthStateChange는 더 이상 사용하지 않음
 * (자체 인증 모델에서는 세션 이벤트가 useAuth 컨텍스트 자체로 흐름).
 */
import { useEffect } from "react";

export function useSessionSync() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("parkmaster-auth");

    channel.onmessage = (event) => {
      switch (event.data?.type) {
        case "LOGOUT":
          window.location.href = "/login?reason=logout_other_tab";
          break;
        case "SESSION_EXPIRED":
          window.location.href = "/login?reason=expired";
          break;
        case "FORCE_LOGOUT":
          window.location.href = "/login?reason=forced";
          break;
      }
    };

    return () => channel.close();
  }, []);
}
