/** SEC-5: 보안 관리 대시보드 (admin 전용, 5개 서브탭) */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { isSecurityDiagnosisDay } from "@/lib/bot-protection";
import { logSecurityAudit } from "@/lib/auth-security";
import { SECURITY_CONFIG_LABELS, EVENT_TYPE_LABELS, SEVERITY_CONFIG } from "@/types/security";
import type { SecurityAuditLog, PIIAccessLog, IPWhitelistEntry } from "@/types/security";
import {
  Shield, ShieldCheck, ShieldAlert, Activity, Users, Lock, Unlock, Globe,
  Monitor, Smartphone, Tablet, Eye, Save, Plus, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";

// ─── Security Diagnosis Banner ───
export function SecurityDiagnosisBanner() {
  if (!isSecurityDiagnosisDay()) return null;
  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center">
      <span className="text-xs text-amber-700 dark:text-amber-400">
        🔒 오늘은 <strong>사이버보안 진단의 날</strong>입니다. 보안 설정을 점검해주세요.
      </span>
    </div>
  );
}

function DeviceIcon({ type }: { type: string }) {
  if (type === 'mobile') return <Smartphone className="h-4 w-4" />;
  if (type === 'tablet') return <Tablet className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export default function SecurityManagement() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: secConfigs } = useQuery({
    queryKey: ['security-configs'],
    queryFn: async () => {
      const { data } = await supabase.from('system_config').select('*').like('config_key', 'security_%');
      const map: Record<string, string> = {};
      data?.forEach((r: any) => { map[r.config_key] = r.config_value; });
      return map;
    },
  });

  const { data: recentAlerts } = useQuery({
    queryKey: ['security-alerts'],
    queryFn: async () => {
      const { data } = await (supabase.from('security_audit_logs') as any)
        .select('*').in('severity', ['warning', 'critical']).order('created_at', { ascending: false }).limit(10);
      return (data || []) as SecurityAuditLog[];
    },
  });

  const { data: todayStats } = useQuery({
    queryKey: ['security-today-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count: failedLogins } = await (supabase.from('security_audit_logs') as any)
        .select('*', { count: 'exact', head: true }).eq('event_type', 'auth_login_failed').gte('created_at', today);
      const { count: activeSessions } = await (supabase.from('active_sessions') as any)
        .select('*', { count: 'exact', head: true }).eq('is_active', true);
      const { count: pwExpiring } = await supabase.from('profiles')
        .select('*', { count: 'exact', head: true })
        .not('password_expires_at', 'is', null)
        .lt('password_expires_at', new Date(Date.now() + 30 * 86400000).toISOString());
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count: inactive } = await supabase.from('profiles')
        .select('*', { count: 'exact', head: true }).lt('last_login_at', thirtyDaysAgo);
      return { failedLogins: failedLogins || 0, activeSessions: activeSessions || 0, pwExpiring: pwExpiring || 0, inactive: inactive || 0 };
    },
  });

  const securityScore = useMemo(() => {
    if (!secConfigs) return 0;
    let s = 0;
    if (window.location.protocol === 'https:') s += 15;
    if (parseInt(secConfigs.security_password_min_length || '0') >= 8) s += 15;
    if (secConfigs.security_pii_masking_enabled === 'true') s += 10;
    s += 10;
    if (parseInt(secConfigs.security_session_timeout_minutes || '0') > 0) s += 10;
    if (parseInt(secConfigs.security_max_login_attempts || '0') > 0) s += 10;
    if ((todayStats?.inactive || 0) === 0) s += 10;
    s += 10 + 5;
    if (secConfigs.security_ip_whitelist_enabled === 'true') s += 5;
    return Math.min(s, 100);
  }, [secConfigs, todayStats]);

  const scoreColor = securityScore >= 80 ? 'text-green-600' : securityScore >= 60 ? 'text-yellow-600' : 'text-red-600';

  // Settings
  const [editedSec, setEditedSec] = useState<Record<string, string>>({});
  const secVal = (key: string) => editedSec[key] ?? secConfigs?.[key] ?? '';

  const saveSecurityConfig = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(editedSec)) {
        const oldValue = secConfigs?.[key];
        await supabase.from('system_config').update({ config_value: value }).eq('config_key', key);
        await logSecurityAudit('config_change', 'critical', { key, old_value: oldValue, new_value: value });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['security-configs'] }); setEditedSec({}); toast.success('보안 설정 저장됨'); },
  });

  // Audit logs
  const [auditFilter, setAuditFilter] = useState({ severity: 'all', eventType: 'all' });
  const { data: auditLogs } = useQuery({
    queryKey: ['audit-logs', auditFilter],
    queryFn: async () => {
      let q = (supabase.from('security_audit_logs') as any).select('*').order('created_at', { ascending: false }).limit(100);
      if (auditFilter.severity !== 'all') q = q.eq('severity', auditFilter.severity);
      if (auditFilter.eventType !== 'all') q = q.eq('event_type', auditFilter.eventType);
      const { data } = await q;
      return (data || []) as SecurityAuditLog[];
    },
  });

  // PII logs
  const { data: piiLogs } = useQuery({
    queryKey: ['pii-logs'],
    queryFn: async () => {
      const { data } = await (supabase.from('pii_access_logs') as any).select('*').order('created_at', { ascending: false }).limit(100);
      return (data || []) as PIIAccessLog[];
    },
  });

  // IP + Sessions + Locked
  const { data: ipList } = useQuery({
    queryKey: ['ip-whitelist'],
    queryFn: async () => {
      const { data } = await (supabase.from('ip_whitelist') as any).select('*').order('created_at', { ascending: false });
      return (data || []) as IPWhitelistEntry[];
    },
  });

  const { data: allSessions } = useQuery({
    queryKey: ['all-sessions'],
    queryFn: async () => {
      const { data } = await (supabase.from('active_sessions') as any).select('*').eq('is_active', true).order('last_activity', { ascending: false });
      return data || [];
    },
  });

  const { data: lockedAccounts } = useQuery({
    queryKey: ['locked-accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name, email, locked_until, login_fail_count')
        .not('locked_until', 'is', null).gt('locked_until', new Date().toISOString());
      return data || [];
    },
  });

  const [newIp, setNewIp] = useState({ ip: '', range: '', desc: '' });
  const [showIpDialog, setShowIpDialog] = useState(false);
  const [logDetailOpen, setLogDetailOpen] = useState<SecurityAuditLog | null>(null);

  const addIp = useMutation({
    mutationFn: async () => {
      await (supabase.from('ip_whitelist') as any).insert({ ip_address: newIp.ip, ip_range: newIp.range || null, description: newIp.desc || null, created_by: profile?.id });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ip-whitelist'] }); setShowIpDialog(false); setNewIp({ ip: '', range: '', desc: '' }); toast.success('IP 추가됨'); },
  });

  const unlockAccount = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('profiles').update({ locked_until: null, login_fail_count: 0 } as any).eq('id', userId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['locked-accounts'] }); toast.success('잠금 해제됨'); },
  });

  const terminateSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await (supabase.from('active_sessions') as any).update({ is_active: false }).eq('id', sessionId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-sessions'] }); toast.success('세션 종료됨'); },
  });

  return (
    <div className="space-y-4">
      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard"><ShieldCheck className="h-3 w-3 mr-1" />보안 현황</TabsTrigger>
          <TabsTrigger value="settings"><Shield className="h-3 w-3 mr-1" />보안 설정</TabsTrigger>
          <TabsTrigger value="audit"><Activity className="h-3 w-3 mr-1" />감사 로그</TabsTrigger>
          <TabsTrigger value="pii"><Eye className="h-3 w-3 mr-1" />개인정보 접근</TabsTrigger>
          <TabsTrigger value="access"><Globe className="h-3 w-3 mr-1" />접근 관리</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground mb-2">종합 보안 점수</p>
                <div className={`text-5xl font-bold ${scoreColor}`}>{securityScore}</div>
                <p className="text-xs text-muted-foreground mt-1">/100</p>
                <Progress value={securityScore} className="mt-3 h-2" />
              </CardContent>
            </Card>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              {[
                { label: '오늘 로그인 실패', value: todayStats?.failedLogins || 0, icon: <ShieldAlert className="h-4 w-4" />, warn: (todayStats?.failedLogins || 0) >= 5 },
                { label: '활성 세션', value: todayStats?.activeSessions || 0, icon: <Users className="h-4 w-4" /> },
                { label: 'PW 만료 임박', value: todayStats?.pwExpiring || 0, icon: <Lock className="h-4 w-4" />, warn: (todayStats?.pwExpiring || 0) > 0 },
                { label: '미사용 계정', value: todayStats?.inactive || 0, icon: <AlertTriangle className="h-4 w-4" />, warn: (todayStats?.inactive || 0) > 0 },
              ].map(s => (
                <Card key={s.label} className={s.warn ? 'border-destructive/50' : ''}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 text-muted-foreground">{s.icon}<span className="text-xs">{s.label}</span></div>
                    <div className={`text-2xl font-bold mt-1 ${s.warn ? 'text-destructive' : ''}`}>{s.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">최근 보안 이벤트</CardTitle></CardHeader>
            <CardContent>
              {(!recentAlerts || recentAlerts.length === 0)
                ? <p className="text-xs text-muted-foreground text-center py-4">최근 경고 이벤트가 없습니다.</p>
                : <div className="space-y-2">{recentAlerts.map(ev => (
                    <div key={ev.id} className={`flex items-center justify-between p-2 rounded text-xs border ${ev.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'}`}>
                      <div className="flex items-center gap-2">
                        <Badge className={SEVERITY_CONFIG[ev.severity]?.color || ''} variant="secondary">{SEVERITY_CONFIG[ev.severity]?.label}</Badge>
                        <span>{EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</span>
                        {ev.user_name && <span className="text-muted-foreground">({ev.user_name})</span>}
                      </div>
                      <span className="text-muted-foreground">{timeAgo(ev.created_at)}</span>
                    </div>
                  ))}</div>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {[
            { title: '인증 설정', keys: ['security_password_min_length', 'security_password_require_upper', 'security_password_require_lower', 'security_password_require_number', 'security_password_require_special', 'security_password_expiry_days', 'security_max_login_attempts', 'security_lockout_minutes'] },
            { title: '세션 설정', keys: ['security_session_timeout_minutes', 'security_max_concurrent_sessions'] },
            { title: '접근 제어', keys: ['security_ip_whitelist_enabled', 'security_2fa_enabled'] },
            { title: '개인정보 보호', keys: ['security_pii_masking_enabled', 'security_export_requires_approval', 'security_data_encryption_enabled'] },
            { title: '감사', keys: ['security_audit_retention_days'] },
          ].map(group => (
            <Card key={group.title}>
              <CardHeader><CardTitle className="text-sm">{group.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {group.keys.map(key => {
                  const isBool = secVal(key) === 'true' || secVal(key) === 'false';
                  const isReadOnly = key === 'security_data_encryption_enabled';
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <Label className="text-xs">{SECURITY_CONFIG_LABELS[key] || key}</Label>
                      {isBool ? (
                        <Switch checked={secVal(key) === 'true'} disabled={isReadOnly}
                          onCheckedChange={v => setEditedSec({ ...editedSec, [key]: v ? 'true' : 'false' })} />
                      ) : (
                        <Input type="number" className="w-24 h-8 text-xs" value={secVal(key)} disabled={isReadOnly}
                          onChange={e => setEditedSec({ ...editedSec, [key]: e.target.value })} />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          {Object.keys(editedSec).length > 0 && (
            <div className="flex justify-end">
              <Button onClick={() => saveSecurityConfig.mutate()} disabled={saveSecurityConfig.isPending}>
                <Save className="h-4 w-4 mr-1" />보안 설정 저장
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Audit Logs */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Select value={auditFilter.severity} onValueChange={v => setAuditFilter(f => ({ ...f, severity: v }))}>
              <SelectTrigger className="w-32 h-8"><SelectValue placeholder="심각도" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="info">정보</SelectItem>
                <SelectItem value="warning">경고</SelectItem>
                <SelectItem value="critical">위험</SelectItem>
              </SelectContent>
            </Select>
            <Select value={auditFilter.eventType} onValueChange={v => setAuditFilter(f => ({ ...f, eventType: v }))}>
              <SelectTrigger className="w-40 h-8"><SelectValue placeholder="이벤트" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['audit-logs'] })}>
              <RefreshCw className="h-3 w-3 mr-1" />새로고침
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">시간</TableHead>
                    <TableHead className="text-xs">심각도</TableHead>
                    <TableHead className="text-xs">이벤트</TableHead>
                    <TableHead className="text-xs">사용자</TableHead>
                    <TableHead className="text-xs">결과</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs?.map(log => (
                    <TableRow key={log.id} className={`cursor-pointer ${log.severity === 'critical' ? 'bg-red-50/50 dark:bg-red-950/10' : log.severity === 'warning' ? 'bg-yellow-50/50 dark:bg-yellow-950/10' : ''}`}
                      onClick={() => setLogDetailOpen(log)}>
                      <TableCell className="text-[11px]">{new Date(log.created_at).toLocaleString('ko-KR')}</TableCell>
                      <TableCell><Badge className={SEVERITY_CONFIG[log.severity]?.color || ''} variant="secondary">{SEVERITY_CONFIG[log.severity]?.label}</Badge></TableCell>
                      <TableCell className="text-xs">{EVENT_TYPE_LABELS[log.event_type] || log.event_type}</TableCell>
                      <TableCell className="text-xs">{log.user_name || '-'}</TableCell>
                      <TableCell>{log.success ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Dialog open={!!logDetailOpen} onOpenChange={() => setLogDetailOpen(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="text-sm">감사 로그 상세</DialogTitle></DialogHeader>
              {logDetailOpen && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">이벤트:</span> {EVENT_TYPE_LABELS[logDetailOpen.event_type] || logDetailOpen.event_type}</div>
                    <div><span className="text-muted-foreground">심각도:</span> {SEVERITY_CONFIG[logDetailOpen.severity]?.label}</div>
                    <div><span className="text-muted-foreground">사용자:</span> {logDetailOpen.user_name || '-'}</div>
                    <div><span className="text-muted-foreground">IP:</span> {logDetailOpen.ip_address || '-'}</div>
                    <div><span className="text-muted-foreground">경로:</span> {logDetailOpen.request_path || '-'}</div>
                    <div><span className="text-muted-foreground">시간:</span> {new Date(logDetailOpen.created_at).toLocaleString('ko-KR')}</div>
                  </div>
                  {logDetailOpen.action_detail && (
                    <div><p className="text-muted-foreground mb-1">상세:</p><pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-40">{JSON.stringify(logDetailOpen.action_detail, null, 2)}</pre></div>
                  )}
                  {logDetailOpen.before_value && (
                    <div><p className="text-muted-foreground mb-1">변경 전:</p><pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-32">{JSON.stringify(logDetailOpen.before_value, null, 2)}</pre></div>
                  )}
                  {logDetailOpen.after_value && (
                    <div><p className="text-muted-foreground mb-1">변경 후:</p><pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-32">{JSON.stringify(logDetailOpen.after_value, null, 2)}</pre></div>
                  )}
                  {logDetailOpen.failure_reason && <div><span className="text-muted-foreground">실패 사유:</span> <span className="text-destructive">{logDetailOpen.failure_reason}</span></div>}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* PII Access */}
        <TabsContent value="pii" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">개인정보 접근 이력</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">시간</TableHead>
                    <TableHead className="text-xs">사용자</TableHead>
                    <TableHead className="text-xs">접근유형</TableHead>
                    <TableHead className="text-xs">대상 테이블</TableHead>
                    <TableHead className="text-xs">대상 필드</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {piiLogs?.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-[11px]">{new Date(log.created_at).toLocaleString('ko-KR')}</TableCell>
                      <TableCell className="text-xs">{log.user_name || '-'}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{log.access_type === 'unmask' ? '마스킹해제' : log.access_type}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{log.target_table}</TableCell>
                      <TableCell className="text-xs font-mono">{log.target_field}</TableCell>
                    </TableRow>
                  ))}
                  {(!piiLogs || piiLogs.length === 0) && (
                    <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">접근 이력이 없습니다.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Management */}
        <TabsContent value="access" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">IP 화이트리스트</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowIpDialog(true)}><Plus className="h-3 w-3 mr-1" />IP 추가</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">IP</TableHead>
                    <TableHead className="text-xs">범위</TableHead>
                    <TableHead className="text-xs">설명</TableHead>
                    <TableHead className="text-xs">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ipList?.map(ip => (
                    <TableRow key={ip.id}>
                      <TableCell className="text-xs font-mono">{ip.ip_address}</TableCell>
                      <TableCell className="text-xs">{ip.ip_range || '-'}</TableCell>
                      <TableCell className="text-xs">{ip.description || '-'}</TableCell>
                      <TableCell><Badge variant={ip.is_active ? 'default' : 'secondary'} className="text-[10px]">{ip.is_active ? '활성' : '비활성'}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(!ipList || ipList.length === 0) && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">등록된 IP가 없습니다.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">활성 세션</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">기기</TableHead>
                    <TableHead className="text-xs">IP</TableHead>
                    <TableHead className="text-xs">마지막 활동</TableHead>
                    <TableHead className="text-xs">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSessions?.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell><DeviceIcon type={s.device_info?.type || 'desktop'} /></TableCell>
                      <TableCell className="text-xs font-mono">{s.ip_address || '-'}</TableCell>
                      <TableCell className="text-[11px]">{timeAgo(s.last_activity)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive"
                          onClick={() => terminateSession.mutate(s.id)}>종료</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">잠긴 계정</CardTitle></CardHeader>
            <CardContent>
              {lockedAccounts && lockedAccounts.length > 0 ? (
                <div className="space-y-2">
                  {lockedAccounts.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded border text-xs">
                      <span className="font-medium">{a.name || a.email} — 실패 {a.login_fail_count}회</span>
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => unlockAccount.mutate(a.id)}>
                        <Unlock className="h-3 w-3 mr-1" />해제
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground text-center py-4">잠긴 계정이 없습니다.</p>}
            </CardContent>
          </Card>

          <Dialog open={showIpDialog} onOpenChange={setShowIpDialog}>
            <DialogContent>
              <DialogHeader><DialogTitle className="text-sm">IP 추가</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">IP 주소</Label><Input placeholder="192.168.1.1" value={newIp.ip} onChange={e => setNewIp({ ...newIp, ip: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">CIDR 범위</Label><Input placeholder="/24" value={newIp.range} onChange={e => setNewIp({ ...newIp, range: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">설명</Label><Input placeholder="내부망" value={newIp.desc} onChange={e => setNewIp({ ...newIp, desc: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowIpDialog(false)}>취소</Button>
                <Button onClick={() => addIp.mutate()} disabled={!newIp.ip}>추가</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
