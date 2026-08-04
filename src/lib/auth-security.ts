/** Authentication security and active-session management. */
import { supabase } from '@/integrations/supabase/client';
import type { LoginResult } from '@/types/security';
import { getSessionIdentity } from '@/lib/session-identity';

async function getConfig(key: string): Promise<string> {
  const { data } = await supabase.from('system_config').select('config_value').eq('config_key', key).maybeSingle();
  return data?.config_value || '';
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);
  return {
    type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    browser: /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Other',
    os: /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : /Android/.test(ua) ? 'Android' : /iOS/.test(ua) ? 'iOS' : 'Other',
  };
}

function isMissingRpc(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string; details?: string };
  const combined = `${candidate.code || ''} ${candidate.message || ''} ${candidate.details || ''}`.toLowerCase();
  return combined.includes('pgrst202') || combined.includes('could not find the function') || combined.includes('404');
}

export async function logSecurityAudit(
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  detail?: Record<string, unknown>,
  options?: { success?: boolean; failureReason?: string; userId?: string; userName?: string },
) {
  try {
    await (supabase.rpc as any)('write_security_audit_event', {
      p_event_type: eventType,
      p_severity: severity,
      p_detail: { ...(detail || {}), request_path: window.location.pathname, user_agent: navigator.userAgent },
      p_success: options?.success ?? true,
      p_failure_reason: options?.failureReason || null,
    });
  } catch {
    // Authentication must remain available when audit storage is temporarily unavailable.
  }
}

export async function registerSession(userId: string, token: string): Promise<boolean> {
  try {
    const maxSessions = parseInt(await getConfig('security_max_concurrent_sessions') || '3');
    const timeoutMinutes = parseInt(await getConfig('security_session_timeout_minutes') || '30');

    const { data: sessions, error: sessionsError } = await (supabase.from('active_sessions') as any)
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('started_at', { ascending: true });
    if (sessionsError) return false;

    if (sessions && sessions.length >= maxSessions) {
      const oldest = sessions[0];
      const { error } = await (supabase.from('active_sessions') as any).update({ is_active: false }).eq('id', oldest.id);
      if (error) return false;
    }

    const { error } = await (supabase.from('active_sessions') as any).insert({
      user_id: userId,
      session_token: getSessionIdentity(token),
      user_agent: navigator.userAgent,
      device_info: getDeviceInfo(),
      expires_at: new Date(Date.now() + timeoutMinutes * 60000).toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function deactivateSession(userId: string) {
  try {
    await (supabase.from('active_sessions') as any)
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);
  } catch {
    // Supabase authentication still clears the local and server auth session.
  }
}

export async function secureLogin(
  email: string,
  password: string,
  signInFn: (e: string, p: string) => Promise<{ error: Error | null }>,
): Promise<LoginResult> {
  const { data: lockRows, error: lockError } = await (supabase.rpc as any)('check_login_lock_status', { p_email: email });
  const legacySecurityMode = isMissingRpc(lockError);
  if (lockError && !legacySecurityMode) {
    return { success: false, error: '로그인 보안 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  const lock = Array.isArray(lockRows) ? lockRows[0] : lockRows;
  if (!legacySecurityMode && lock?.locked) {
    const remainingMinutes = Math.max(Math.ceil(Number(lock.remaining_seconds || 0) / 60), 1);
    return { success: false, error: `계정이 잠겨 있습니다. ${remainingMinutes}분 후 다시 시도해 주세요.`, locked: true, remainingMinutes };
  }

  const { error } = await signInFn(email, password);
  if (error) {
    // Supabase Auth performs server-side abuse prevention. A public custom
    // failure counter would let an attacker lock another user's account.
    return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: '로그인 세션을 확인하지 못했습니다.' };

  const { error: resetError } = await (supabase.rpc as any)('reset_login_security_state');
  if (resetError && isMissingRpc(resetError)) {
    const { error: fallbackResetError } = await (supabase.from('profiles') as any)
      .update({ login_fail_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (fallbackResetError) {
      await supabase.auth.signOut();
      return { success: false, error: '로그인 보안 상태를 초기화하지 못했습니다.' };
    }
  } else if (resetError) {
    await supabase.auth.signOut();
    return { success: false, error: '로그인 보안 상태를 초기화하지 못했습니다.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, password_changed_at, must_change_password')
    .eq('id', session.user.id)
    .single();
  if (profileError) {
    await supabase.auth.signOut();
    return { success: false, error: '사용자 보안 정보를 불러오지 못했습니다.' };
  }

  const sessionRegistered = await registerSession(session.user.id, session.access_token);
  if (!sessionRegistered) {
    await supabase.auth.signOut();
    return { success: false, error: '활성 세션을 등록하지 못했습니다. 관리자에게 문의하세요.' };
  }

  const expiryDays = parseInt(await getConfig('security_password_expiry_days') || '90');
  if (expiryDays > 0 && profile?.password_changed_at) {
    const daysSinceChange = (Date.now() - new Date(profile.password_changed_at as string).getTime()) / 86400000;
    if (daysSinceChange > expiryDays) return { success: true, mustChangePassword: true };
  }
  if (profile?.must_change_password) return { success: true, mustChangePassword: true };

  await logSecurityAudit('auth_login', 'info', { email });
  return { success: true };
}
