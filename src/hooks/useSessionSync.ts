/** SEC-WEB-4: 멀티탭 세션 동기화 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useSessionSync() {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('parkmaster-auth');

    channel.onmessage = (event) => {
      switch (event.data.type) {
        case 'LOGOUT':
          supabase.auth.signOut();
          window.location.href = '/login?reason=logout_other_tab';
          break;
        case 'SESSION_EXPIRED':
          window.location.href = '/login?reason=expired';
          break;
        case 'FORCE_LOGOUT':
          supabase.auth.signOut();
          window.location.href = '/login?reason=forced';
          break;
      }
    };

    // Intercept signOut to broadcast
    const handleAuthChange = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        try { channel.postMessage({ type: 'LOGOUT' }); } catch { /* closed */ }
      }
    });

    return () => {
      handleAuthChange.data.subscription.unsubscribe();
      channel.close();
    };
  }, []);
}
