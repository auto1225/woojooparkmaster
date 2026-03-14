import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Key, Plus, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/lots', description: '전체 주차장 실시간 현황' },
  { method: 'GET', path: '/api/v1/lots/:id', description: '개별 주차장 현황' },
  { method: 'GET', path: '/api/v1/lots/:id/history', description: '시간대별 이력' },
  { method: 'WS', path: '/ws/realtime', description: '실시간 구독 (WebSocket)' },
];

// Mock data for demo
const mockKeys = [
  { id: '1', name: '카카오맵 연동', key: 'pk_live_xxxx...xxxx1234', created: '2026-01-15', expires: '2027-01-15', status: 'active', calls: 12450 },
  { id: '2', name: '네이버맵 연동', key: 'pk_live_xxxx...xxxx5678', created: '2026-02-01', expires: '2027-02-01', status: 'active', calls: 8320 },
  { id: '3', name: '주차포털', key: 'pk_live_xxxx...xxxx9012', created: '2025-06-01', expires: '2026-06-01', status: 'expired', calls: 0 },
];

const dailyCalls = Array.from({ length: 14 }, (_, i) => ({
  date: `3/${i + 1}`,
  calls: Math.round(800 + Math.random() * 400),
}));

const endpointCalls = [
  { name: '/lots', value: 65, color: 'hsl(var(--primary))' },
  { name: '/lots/:id', value: 25, color: 'hsl(210, 60%, 50%)' },
  { name: '/lots/:id/history', value: 8, color: 'hsl(30, 80%, 55%)' },
  { name: '/ws/realtime', value: 2, color: 'hsl(120, 50%, 45%)' },
];

export default function RealtimeApi() {
  const [showCreate, setShowCreate] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpires, setNewKeyExpires] = useState('');

  const totalCalls = dailyCalls.reduce((s, d) => s + d.calls, 0);

  const toggleKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
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
                      <Badge variant="outline" className={`text-xs ${ep.method === 'WS' ? 'text-purple-600 bg-purple-50' : 'text-emerald-600 bg-emerald-50'}`}>
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
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" />키 생성</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>키</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead>만료일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">호출수 (이번달)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockKeys.map(k => (
                  <TableRow key={k.id}>
                    <TableCell className="text-sm font-medium">{k.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">{showKeys[k.id] ? k.key.replace(/xxxx/g, 'abcd') : k.key}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleKey(k.id)}>
                          {showKeys[k.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(k.key); toast({ title: "복사됨" }); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{k.created}</TableCell>
                    <TableCell className="text-xs">{k.expires}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${k.status === 'active' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {k.status === 'active' ? '활성' : '만료'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{k.calls.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Call Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">일별 호출 추이</CardTitle>
              <p className="text-xs text-muted-foreground">이번 달 총 {totalCalls.toLocaleString()}건</p>
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
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={endpointCalls} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${value}%`}>
                    {endpointCalls.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Create Key Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>API 키 생성</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>키 이름</Label>
                <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="예: 카카오맵 연동" />
              </div>
              <div>
                <Label>만료일</Label>
                <Input type="date" value={newKeyExpires} onChange={e => setNewKeyExpires(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
              <Button onClick={() => {
                toast({ title: "API 키가 생성되었습니다", description: "실제 구현 시 Edge Function으로 키 관리" });
                setShowCreate(false);
              }}>생성</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
