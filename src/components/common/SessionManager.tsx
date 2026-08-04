import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const IDLE_TIMEOUT = 30 * 60 * 1000;
const WARNING_BEFORE = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];

export function SessionManager() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const showWarningRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>();

  const setWarning = useCallback((visible: boolean) => {
    showWarningRef.current = visible;
    setShowWarning(visible);
  }, []);

  const finishSignOut = useCallback(async (reason: "manual" | "expired") => {
    await signOut();
    window.location.assign(`/login?reason=${reason}`);
  }, [signOut]);

  const resetTimers = useCallback(() => {
    clearTimeout(idleTimer.current);
    clearTimeout(logoutTimer.current);
    setWarning(false);

    if (!user) return;

    idleTimer.current = setTimeout(() => {
      setWarning(true);
      logoutTimer.current = setTimeout(() => {
        void finishSignOut("expired");
      }, WARNING_BEFORE);
    }, IDLE_TIMEOUT - WARNING_BEFORE);
  }, [finishSignOut, setWarning, user]);

  useEffect(() => {
    if (!user) return;

    resetTimers();

    const onActivity = () => {
      if (!showWarningRef.current) resetTimers();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    return () => {
      clearTimeout(idleTimer.current);
      clearTimeout(logoutTimer.current);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
    };
  }, [resetTimers, user]);

  const handleContinue = () => resetTimers();
  const handleLogout = () => void finishSignOut("manual");

  if (!user) return null;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>세션 만료 경고</AlertDialogTitle>
          <AlertDialogDescription>
            5분 후 자동으로 로그아웃됩니다. 계속 사용하시겠습니까?
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
