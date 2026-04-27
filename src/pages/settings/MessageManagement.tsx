import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Send, MessageSquare, RefreshCw } from "lucide-react";
import { sendMessage, ALIMTALK_TEMPLATES, fillTemplate } from "@/lib/message-service";

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
const STATUS_LABELS: Record<string, string> = { pending: '대기', sent: '발송', delivered: '수신', failed: '실패' };
const CHANNEL_LABELS: Record<string, string> = { alimtalk: '알림톡', sms: 'SMS', lms: 'LMS', email: '이메일' };

export default function MessageManagement() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [sendDialog, setSendDialog] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendForm, setSendForm] = useState({ channel: 'sms' as any, phone: '', content: '', template: '' });

  const { data: messages } = useQuery({
    queryKey: ['message-logs', channelFilter, statusFilter],
    queryFn: async () => {
      let q = supabase.from('message_logs').select('*').order('created_at', { ascending: false }).limit(100);
      if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data } = await q;
      return data || [];
    },
  });

  const stats = {
    total: messages?.length || 0,
    sent: messages?.filter(m => m.status === 'sent' || m.status === 'delivered').length || 0,
    failed: messages?.filter(m => m.status === 'failed').length || 0,
  };

  const handleSend = async () => {
    if (!sendForm.phone || !sendForm.content) { toast.error('수신자와 내용을 입력하세요'); return; }
    try {
      await sendMessage({
        channel: sendForm.channel,
        recipientPhone: sendForm.phone,
        content: sendForm.content,
        module: 'manual',
      });
      toast.success('발송 요청이 등록되었습니다');
      setSendDialog(false);
      setSendForm({ channel: 'sms', phone: '', content: '', template: '' });
      queryClient.invalidateQueries({ queryKey: ['message-logs'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const selectTemplate = (key: string) => {
    const tmpl = ALIMTALK_TEMPLATES[key as keyof typeof ALIMTALK_TEMPLATES];
    if (tmpl) {
      setSendForm(f => ({ ...f, content: tmpl.content, channel: 'alimtalk', template: key }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />메시지 발송 관리
        </h3>
        <Button size="sm" onClick={() => setSendDialog(true)}>
          <Send className="h-3.5 w-3.5 mr-1" />수동 발송
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">전체 발송</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-emerald-600">{stats.sent}</p><p className="text-xs text-muted-foreground">성공</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-red-600">{stats.failed}</p><p className="text-xs text-muted-foreground">실패</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="채널" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 채널</SelectItem>
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>일시</TableHead>
                <TableHead>채널</TableHead>
                <TableHead>수신자</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>모듈</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages?.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{new Date(m.created_at).toLocaleString('ko-KR')}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{CHANNEL_LABELS[m.channel] || m.channel}</Badge></TableCell>
                  <TableCell className="text-xs">{m.recipient_name || m.recipient_phone}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{m.content}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${STATUS_COLORS[m.status] || ''}`}>{STATUS_LABELS[m.status] || m.status}</Badge></TableCell>
                  <TableCell className="text-xs">{m.module}</TableCell>
                </TableRow>
              ))}
              {(!messages || messages.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">발송 이력이 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Send Dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>수동 메시지 발송</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">채널</Label>
              <Select value={sendForm.channel} onValueChange={v => setSendForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alimtalk">알림톡</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="lms">LMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">수신자 전화번호</Label>
              <Input value={sendForm.phone} onChange={e => setSendForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <Label className="text-xs">템플릿 선택 (선택사항)</Label>
              <Select value={sendForm.template} onValueChange={selectTemplate}>
                <SelectTrigger><SelectValue placeholder="직접 입력" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ALIMTALK_TEMPLATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">내용</Label>
              <Textarea value={sendForm.content} onChange={e => setSendForm(f => ({ ...f, content: e.target.value }))} rows={4} />
            </div>
          </div>
          <DialogFooter><Button onClick={handleSend}><Send className="h-3.5 w-3.5 mr-1" />발송</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
