import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const IDLE_TIMEOUT = 30 * 60 * 1000;   // 30분
const WARNING_BEFORE = 5 * 60 * 1000;  // 5분 전 경고
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];

export function SessionManager() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>();

  const resetTimers = useCallback(() => {
    clearTimeout(idleTimer.current);
    clearTimeout(logoutTimer.current);
    setShowWarning(false);

    if (!user) return;

    idleTimer.current = setTimeout(() => {
      setShowWarning(true);
      logoutTimer.current = setTimeout(() => {
        signOut();
        window.location.href = "/login?expired=1";
      }, WARNING_BEFORE);
    }, IDLE_TIMEOUT - WARNING_BEFORE);
  }, [user, signOut]);

  useEffect(() => {
    if (!user) return;

    resetTimers();

    const onActivity = () => {
      if (!showWarning) resetTimers();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Cross-tab logout via storage event
    const onStorage = (e: StorageEvent) => {
      if (e.key === "parkmaster-logout") {
        signOut();
        window.location.href = "/login?expired=1";
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearTimeout(idleTimer.current);
      clearTimeout(logoutTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("storage", onStorage);
    };
  }, [user, resetTimers, showWarning]);

  const handleContinue = () => {
    setShowWarning(false);
    resetTimers();
  };

  const handleLogout = () => {
    localStorage.setItem("parkmaster-logout", Date.now().toString());
    signOut();
    window.location.href = "/login?expired=1";
  };

  if (!user) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>세션 만료 경고</AlertDialogTitle>
          <AlertDialogDescription>
            5분 후 자동 로그아웃됩니다. 계속 사용하시겠습니까?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLogout}>로그아웃</AlertDialogCancel>
          <AlertDialogAction onClick={handleContinue}>계속 사용</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
