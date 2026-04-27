/** SEC-2/3: 로그인 보안 + 세션 관리 */
import { supabase } from '@/integrations/api/supabase-compat';
import { authApi } from '@/integrations/api';
import type { LoginResult } from '@/types/security';

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

export async function logSecurityAudit(
  eventType: string,
  severity: 'info' | 'warning' | 'critical',
  detail?: Record<string, any>,
  options?: { success?: boolean; failureReason?: string; userId?: string; userName?: string }
) {
  try {
    const user = await authApi.me();
    await (supabase.from('security_audit_logs') as any).insert({
      event_type: eventType,
      severity,
      user_id: options?.userId || user?.id || null,
      user_name: options?.userName || user?.email?.split('@')[0] || null,
      action_detail: detail || null,
      success: options?.success ?? true,
      failure_reason: options?.failureReason || null,
      user_agent: navigator.userAgent,
      request_path: window.location.pathname,
    });
  } catch {
    // Silent fail for audit logging
  }
}

export async function registerSession(userId: string, token: string) {
  try {
    const maxSessions = parseInt(await getConfig('security_max_concurrent_sessions') || '3');
    const timeoutMinutes = parseInt(await getConfig('security_session_timeout_minutes') || '30');

    const { data: sessions } = await (supabase.from('active_sessions') as any)
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('started_at', { ascending: true });

    if (sessions && sessions.length >= maxSessions) {
      const oldest = sessions[0];
      await (supabase.from('active_sessions') as any).update({ is_active: false }).eq('id', oldest.id);
    }

    await (supabase.from('active_sessions') as any).insert({
      user_id: userId,
      session_token: token.substring(0, 200),
      user_agent: navigator.userAgent,
      device_info: getDeviceInfo(),
      expires_at: new Date(Date.now() + timeoutMinutes * 60000).toISOString(),
    });
  } catch {
    // Silent fail
  }
}

export async function deactivateSession(userId: string) {
  try {
    await (supabase.from('active_sessions') as any)
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);
  } catch {}
}

export async function secureLogin(
  email: string,
  password: string,
  signInFn: (e: string, p: string) => Promise<{ error: Error | null }>
): Promise<LoginResult> {
  // 1. Check lock
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, login_fail_count, locked_until, password_changed_at, must_change_password')
    .eq('email', email)
    .maybeSingle();

  if (profile?.locked_until) {
    const lockedUntil = new Date(profile.locked_until as string);
    if (lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      await logSecurityAudit('auth_login_failed', 'warning', { reason: 'account_locked', email }, { success: false, failureReason: 'account_locked' });
      return { success: false, error: `계정이 잠겨있습니다. ${remainingMinutes}분 후 다시 시도해주세요.`, locked: true, remainingMinutes };
    }
  }

  // 2. Attempt login
  const { error } = await signInFn(email, password);

  if (error) {
    const maxAttempts = parseInt(await getConfig('security_max_login_attempts') || '5');
    const lockoutMinutes = parseInt(await getConfig('security_lockout_minutes') || '5');
    const newCount = ((profile?.login_fail_count as number) || 0) + 1;

    const updates: any = { login_fail_count: newCount };
    if (newCount >= maxAttempts) {
      updates.locked_until = new Date(Date.now() + lockoutMinutes * 60000).toISOString();
      await logSecurityAudit('auth_locked', 'critical', { email, attempts: newCount }, { success: false, failureReason: 'max_attempts' });
    }

    if (profile) {
      await supabase.from('profiles').update(updates).eq('email', email);
    }

    await logSecurityAudit('auth_login_failed', 'warning', { email, attempt: newCount }, { success: false, failureReason: error.message });

    const remaining = maxAttempts - newCount;
    if (remaining > 0) {
      return { success: false, error: `이메일 또는 비밀번호가 올바르지 않습니다. (${remaining}회 남음)` };
    }
    return { success: false, error: `로그인 시도 횟수를 초과했습니다. ${lockoutMinutes}분 후 다시 시도해주세요.`, locked: true };
  }

  // 3. Success — reset counters
  const me = await authApi.me().catch(() => null);
  await supabase.from('profiles').update({
    login_fail_count: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  } as any).eq('email', email);

  // 4. Register session
  if (me) {
    await registerSession(me.id, "");
  }

  // 5. Check password expiry
  const expiryDays = parseInt(await getConfig('security_password_expiry_days') || '90');
  if (expiryDays > 0 && profile?.password_changed_at) {
    const daysSinceChange = (Date.now() - new Date(profile.password_changed_at as string).getTime()) / 86400000;
    if (daysSinceChange > expiryDays) {
      return { success: true, mustChangePassword: true };
    }
  }

  if (profile?.must_change_password) {
    return { success: true, mustChangePassword: true };
  }

  await logSecurityAudit('auth_login', 'info', { email });
  return { success: true };
}
