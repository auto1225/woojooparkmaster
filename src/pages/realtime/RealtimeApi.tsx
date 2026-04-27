import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activity-logger";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/lots', description: '전체 주차장 실시간 현황' },
  { method: 'GET', path: '/api/v1/lots/:id', description: '개별 주차장 현황' },
  { method: 'GET', path: '/api/v1/lots/:id/history', description: '시간대별 이력' },
  { method: 'WS', path: '/ws/realtime', description: '실시간 구독 (WebSocket)' },
];

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'pk_live_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function maskKey(key: string): string {
  if (key.length <= 12) return key;
  return key.slice(0, 8) + '••••••••' + key.slice(-4);
}

export default function RealtimeApi() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const [showCreate, setShowCreate] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpires, setNewKeyExpires] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState('60');

  // Fetch API keys
  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch call logs for charts (last 14 days)
  const { data: callLogs } = useQuery({
    queryKey: ['api-call-logs-chart'],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const { data, error } = await supabase
        .from('api_call_logs')
        .select('endpoint, method, called_at')
        .gte('called_at', since.toISOString())
        .order('called_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Compute chart data from real logs
  const { dailyCalls, endpointCalls, totalCalls } = useMemo(() => {
    const logs = callLogs || [];
    const dayMap: Record<string, number> = {};
    const epMap: Record<string, number> = {};

    // Initialize last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      dayMap[key] = 0;
    }

    logs.forEach(log => {
      const d = new Date(log.called_at);
      const dayKey = `${d.getMonth() + 1}/${d.getDate()}`;
      if (dayKey in dayMap) dayMap[dayKey]++;
      const ep = log.endpoint || 'unknown';
      epMap[ep] = (epMap[ep] || 0) + 1;
    });

    const daily = Object.entries(dayMap).map(([date, calls]) => ({ date, calls }));
    const total = logs.length;

    const colors = ['hsl(var(--primary))', 'hsl(210, 60%, 50%)', 'hsl(30, 80%, 55%)', 'hsl(120, 50%, 45%)', 'hsl(280, 50%, 55%)'];
    const epEntries = Object.entries(epMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], i) => ({
        name,
        value: total > 0 ? Math.round((value / total) * 100) : 0,
        color: colors[i % colors.length],
      }));

    return { dailyCalls: daily, endpointCalls: epEntries, totalCalls: total };
  }, [callLogs]);

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const fullKey = generateApiKey();
      const prefix = fullKey.slice(0, 12) + '...';
      const { error } = await supabase.from('api_keys').insert({
        key_name: newKeyName.trim(),
        api_key: fullKey,
        key_prefix: prefix,
        description: newKeyDescription.trim() || null,
        rate_limit_per_minute: parseInt(newKeyRateLimit) || 60,
        expires_at: newKeyExpires ? new Date(newKeyExpires).toISOString() : null,
        created_by: user?.id,
        notes: null,
      } as any);
      if (error) throw error;
      return fullKey;
    },
    onSuccess: (fullKey) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      logActivity({ module: 'realtime', action: 'create', targetType: 'api_key', targetName: newKeyName });
      toast({
        title: "API 키가 생성되었습니다",
        description: "키를 복사하세요. 이후에는 마스킹 처리됩니다.",
      });
      navigator.clipboard.writeText(fullKey);
      setShowCreate(false);
      setNewKeyName('');
      setNewKeyExpires('');
      setNewKeyDescription('');
      setNewKeyRateLimit('60');
    },
    onError: (err: any) => {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    },
  });

  // Revoke / Delete key
  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase.from('api_keys').update({ status: 'revoked' } as any).eq('id', keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: "키가 폐기되었습니다" });
      setDeleteTarget(null);
    },
  });

  const toggleKey = (id: string) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));

  const getStatusBadge = (key: any) => {
    if (key.status === 'revoked') return <Badge variant="destructive" className="text-[10px]">폐기</Badge>;
    if (key.expires_at && new Date(key.expires_at) < new Date()) return <Badge variant="outline" className="text-[10px] text-destructive">만료</Badge>;
    return <Badge variant="outline" className="text-[10px] text-emerald-600">활성</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">API 관리</h2>
          <p className="text-sm text-muted-foreground">외부 시스템 연동을 위한 API 엔드포인트 및 키 관리</p>
        </div>

        {/* API Endpoints */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">API 엔드포인트</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">메서드</TableHead>
                  <TableHead>경로</TableHead>
                  <TableHead>설명</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ENDPOINTS.map((ep, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${ep.method === 'WS' ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'}`}>
                        {ep.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{ep.path}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ep.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">API 키 관리</CardTitle>
            {canEdit && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />키 생성
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {keysLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !apiKeys?.length ? (
              <div className="p-8">
                <EmptyState icon={Key} title="등록된 API 키가 없습니다" description="외부 시스템 연동을 위해 API 키를 생성하세요" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>키</TableHead>
                    <TableHead>생성일</TableHead>
                    <TableHead>만료일</TableHead>
                    <TableHead>Rate Limit</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">호출수</TableHead>
                    {canEdit && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((k: any) => (
                    <TableRow key={k.id}>
                      <TableCell className="text-sm font-medium">
                        <div>
                          {k.key_name}
                          {k.description && <p className="text-xs text-muted-foreground mt-0.5">{k.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{showKeys[k.id] ? k.api_key : maskKey(k.api_key)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleKey(k.id)}>
                            {showKeys[k.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                            navigator.clipboard.writeText(k.api_key);
                            toast({ title: "클립보드에 복사되었습니다" });
                          }}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{k.created_at?.split('T')[0]}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{k.expires_at?.split('T')[0] || '무기한'}</TableCell>
                      <TableCell className="text-xs">{k.rate_limit_per_minute}/분</TableCell>
                      <TableCell>{getStatusBadge(k)}</TableCell>
                      <TableCell className="text-right text-sm">{(k.total_calls || 0).toLocaleString()}</TableCell>
                      {canEdit && (
                        <TableCell>
                          {k.status === 'active' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(k)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Call Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">일별 호출 추이</CardTitle>
              <p className="text-xs text-muted-foreground">최근 14일 총 {totalCalls.toLocaleString()}건</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyCalls}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" name="호출수" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">엔드포인트별 호출 비율</CardTitle></CardHeader>
            <CardContent>
              {endpointCalls.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">호출 기록이 없습니다</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={endpointCalls} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${value}%`}>
                      {endpointCalls.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create Key Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>API 키 생성</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>키 이름 <span className="text-destructive">*</span></Label>
                <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="예: 카카오맵 연동" />
              </div>
              <div>
                <Label>설명</Label>
                <Input value={newKeyDescription} onChange={e => setNewKeyDescription(e.target.value)} placeholder="용도 설명 (선택)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>만료일</Label>
                  <Input type="date" value={newKeyExpires} onChange={e => setNewKeyExpires(e.target.value)} />
                </div>
                <div>
                  <Label>Rate Limit (분당)</Label>
                  <Select value={newKeyRateLimit} onValueChange={setNewKeyRateLimit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30/분</SelectItem>
                      <SelectItem value="60">60/분</SelectItem>
                      <SelectItem value="120">120/분</SelectItem>
                      <SelectItem value="300">300/분</SelectItem>
                      <SelectItem value="1000">1000/분</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!newKeyName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke Confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>API 키 폐기</AlertDialogTitle>
              <AlertDialogDescription>
                '{deleteTarget?.key_name}' 키를 폐기하시겠습니까? 폐기된 키는 더 이상 사용할 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTarget && revokeMutation.mutate(deleteTarget.id)}
              >
                폐기
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
