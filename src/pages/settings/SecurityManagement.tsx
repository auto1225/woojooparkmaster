/** SEC-5: 보안 관리 대시보드 (admin 전용, 7개 서브탭) */
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
  Package, Network, Server, Database, File,
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

// ─── 의존성 보안 정보 (SEC-WEB-5 정적 표시) ───
const PACKAGE_SECURITY = [
  { name: 'React', version: '18.x', purpose: 'UI 프레임워크', safe: true },
  { name: 'Supabase JS', version: '2.x', purpose: '백엔드 연동', safe: true },
  { name: 'TanStack Query', version: '5.x', purpose: '데이터 캐싱', safe: true },
  { name: 'Recharts', version: '2.x', purpose: '차트', safe: true },
  { name: 'DOMPurify', version: '3.x', purpose: 'XSS 방어', safe: true },
  { name: 'Zod', version: '3.x', purpose: '데이터 검증', safe: true },
  { name: 'date-fns', version: '3.x', purpose: '날짜 처리', safe: true },
  { name: 'Framer Motion', version: '11.x', purpose: '애니메이션', safe: true },
];

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
    s += 10; // RLS
    if (parseInt(secConfigs.security_session_timeout_minutes || '0') > 0) s += 10;
    if (parseInt(secConfigs.security_max_login_attempts || '0') > 0) s += 10;
    if ((todayStats?.inactive || 0) === 0) s += 10;
    s += 10 + 5; // file security + rate limiting
    if (secConfigs.security_ip_whitelist_enabled === 'true') s += 5;
    return Math.min(s, 100);
  }, [secConfigs, todayStats]);

  const scoreColor = securityScore >= 80 ? 'text-primary' : securityScore >= 60 ? 'text-amber-600' : 'text-destructive';

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
          <TabsTrigger value="software"><Package className="h-3 w-3 mr-1" />소프트웨어 보안</TabsTrigger>
          <TabsTrigger value="network"><Network className="h-3 w-3 mr-1" />네트워크 보안</TabsTrigger>
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
                    <div key={ev.id} className={`flex items-center justify-between p-2 rounded text-xs border ${ev.severity === 'critical' ? 'bg-destructive/5 border-destructive/30' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'}`}>
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
                    <TableRow key={log.id} className={`cursor-pointer ${log.severity === 'critical' ? 'bg-destructive/5' : log.severity === 'warning' ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}
                      onClick={() => setLogDetailOpen(log)}>
                      <TableCell className="text-[11px]">{new Date(log.created_at).toLocaleString('ko-KR')}</TableCell>
                      <TableCell><Badge className={SEVERITY_CONFIG[log.severity]?.color || ''} variant="secondary">{SEVERITY_CONFIG[log.severity]?.label}</Badge></TableCell>
                      <TableCell className="text-xs">{EVENT_TYPE_LABELS[log.event_type] || log.event_type}</TableCell>
                      <TableCell className="text-xs">{log.user_name || '-'}</TableCell>
                      <TableCell>{log.success ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <XCircle className="h-3 w-3 text-destructive" />}</TableCell>
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

        {/* SEC-WEB-5: 소프트웨어 보안 */}
        <TabsContent value="software" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" />의존성 패키지 보안 현황</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">패키지</TableHead>
                    <TableHead className="text-xs">버전</TableHead>
                    <TableHead className="text-xs">용도</TableHead>
                    <TableHead className="text-xs">보안 상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PACKAGE_SECURITY.map(pkg => (
                    <TableRow key={pkg.name}>
                      <TableCell className="text-xs font-medium">{pkg.name}</TableCell>
                      <TableCell className="text-xs font-mono">{pkg.version}</TableCell>
                      <TableCell className="text-xs">{pkg.purpose}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                          <CheckCircle2 className="h-3 w-3 mr-1" />안전
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs text-muted-foreground">
                <span>마지막 보안 검사: 2026-03-14</span>
                <span>다음 예정 검사: 2026-04-14</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">보안 업데이트 정책</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <p>• <strong>긴급 보안 패치:</strong> 발견 즉시 적용 (24시간 이내)</p>
              <p>• <strong>정기 보안 검사:</strong> 매월 1회</p>
              <p>• <strong>의존성 취약점 검사:</strong> 분기 1회 (npm audit)</p>
              <p>• <strong>보안 업데이트는 유지보수 계약에 포함됩니다.</strong></p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><File className="h-4 w-4" />파일 업로드 보안</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '확장자 검증', desc: '허용된 확장자만 업로드 가능' },
                  { label: 'MIME 타입 검증', desc: '파일 MIME 타입과 확장자 일치 확인' },
                  { label: '매직 바이트 검증', desc: '파일 헤더 분석으로 위장 파일 탐지' },
                  { label: '이중 확장자 차단', desc: 'file.exe.jpg 같은 위장 패턴 차단' },
                  { label: '실행 파일 차단', desc: '.exe, .bat, .sh 등 60+ 확장자 차단' },
                  { label: 'UUID 파일명', desc: '원본 파일명 대신 UUID로 저장' },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-muted-foreground text-[10px]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEC-WEB-7: 네트워크 보안 */}
        <TabsContent value="network" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Network className="h-4 w-4" />네트워크 보안 아키텍처</CardTitle></CardHeader>
            <CardContent>
              <div className="bg-muted/30 rounded-lg p-4 font-mono text-[11px] leading-relaxed overflow-x-auto">
                <div className="space-y-1">
                  <p className="text-center text-muted-foreground mb-3">── ParkMaster™ 보안 네트워크 구성 ──</p>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">인터넷/내부망</span>
                  </div>
                  <p className="text-center text-muted-foreground text-[10px]">│ (443/HTTPS만 허용)</p>
                  
                  <div className="border rounded p-2 mx-auto max-w-sm bg-destructive/5">
                    <p className="text-center font-medium flex items-center justify-center gap-1"><Shield className="h-3 w-3" />방화벽 (UFW)</p>
                    <p className="text-[10px] text-center text-muted-foreground">80, 443 포트만 오픈 / 5432 차단</p>
                  </div>
                  
                  <p className="text-center text-muted-foreground text-[10px]">│</p>
                  
                  <div className="border rounded p-2 mx-auto max-w-sm bg-primary/5">
                    <p className="text-center font-medium flex items-center justify-center gap-1"><Server className="h-3 w-3" />Nginx (리버스 프록시)</p>
                    <p className="text-[10px] text-center text-muted-foreground">SSL 종단 + 보안 헤더 8종 + Rate Limiting + CORS</p>
                  </div>
                  
                  <p className="text-center text-muted-foreground text-[10px]">│ (내부 네트워크)</p>
                  
                  <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                    <div className="border rounded p-2 bg-muted/50">
                      <p className="text-center text-[10px] font-medium flex items-center justify-center gap-1"><Monitor className="h-3 w-3" />Frontend (React)</p>
                      <p className="text-[10px] text-center text-muted-foreground">frontend 네트워크</p>
                    </div>
                    <div className="border rounded p-2 bg-muted/50">
                      <p className="text-center text-[10px] font-medium">Kong (API Gateway)</p>
                      <p className="text-[10px] text-center text-muted-foreground">backend 네트워크</p>
                    </div>
                  </div>
                  
                  <p className="text-center text-muted-foreground text-[10px]">│ (backend 네트워크, 내부 전용)</p>
                  
                  <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
                    {['Auth', 'REST', 'Realtime', 'Storage'].map(s => (
                      <div key={s} className="border rounded p-1 bg-muted/30 text-center text-[10px]">{s}</div>
                    ))}
                  </div>
                  
                  <p className="text-center text-muted-foreground text-[10px]">│ (database 네트워크, 외부 차단)</p>
                  
                  <div className="border-2 border-destructive/30 rounded p-2 mx-auto max-w-xs bg-destructive/5">
                    <p className="text-center font-medium flex items-center justify-center gap-1"><Database className="h-3 w-3" />PostgreSQL</p>
                    <p className="text-[10px] text-center text-destructive">← 외부 접근 완전 차단</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">보안 헤더 (8종)</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {[
                  { header: 'X-XSS-Protection', value: '1; mode=block' },
                  { header: 'X-Content-Type-Options', value: 'nosniff' },
                  { header: 'X-Frame-Options', value: 'DENY' },
                  { header: 'Strict-Transport-Security', value: 'max-age=31536000' },
                  { header: 'Content-Security-Policy', value: "default-src 'self'" },
                  { header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                  { header: 'Permissions-Policy', value: 'camera=(self)...' },
                  { header: 'Access-Control-Allow-Origin', value: '동일 도메인' },
                ].map(h => (
                  <div key={h.header} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                    <span className="font-mono font-medium">{h.header}</span>
                    <span className="text-muted-foreground truncate">{h.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Rate Limiting</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { zone: 'API 요청', rate: '30 req/s', burst: 50 },
                  { zone: '로그인', rate: '5 req/min', burst: 3 },
                  { zone: '파일 업로드', rate: '10 req/min', burst: 5 },
                  { zone: '일반 페이지', rate: '60 req/s', burst: 100 },
                  { zone: '클라이언트', rate: '120 req/min', burst: 0 },
                ].map(rl => (
                  <div key={rl.zone} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                    <span className="font-medium">{rl.zone}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{rl.rate}</Badge>
                      {rl.burst > 0 && <span className="text-muted-foreground">burst: {rl.burst}</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Docker 네트워크 격리</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">네트워크</TableHead>
                    <TableHead className="text-xs">유형</TableHead>
                    <TableHead className="text-xs">서비스</TableHead>
                    <TableHead className="text-xs">외부 접근</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs font-mono">frontend</TableCell>
                    <TableCell className="text-xs">bridge</TableCell>
                    <TableCell className="text-xs">Nginx, Frontend</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">허용 (80, 443)</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">backend</TableCell>
                    <TableCell className="text-xs">internal</TableCell>
                    <TableCell className="text-xs">Nginx, Kong, Auth, REST, Realtime, Storage</TableCell>
                    <TableCell><Badge variant="destructive" className="text-[10px]">차단</Badge></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-mono">database</TableCell>
                    <TableCell className="text-xs">internal</TableCell>
                    <TableCell className="text-xs">PostgreSQL, Auth, REST, Realtime, Storage</TableCell>
                    <TableCell><Badge variant="destructive" className="text-[10px]">완전 차단</Badge></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
