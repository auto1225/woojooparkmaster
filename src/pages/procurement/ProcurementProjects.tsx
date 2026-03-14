import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { BID_TYPE_LABELS, BID_TYPE_COLORS, CONTRACT_TYPE_LABELS, BID_STATUS_LABELS, BID_STATUS_COLORS, formatOkWon } from "@/types/procurement";
import { useNavigate } from "react-router-dom";

export default function ProcurementProjects() {
  const navigate = useNavigate();
  const [statusTab, setStatusTab] = useState('all');
  const [bidType, setBidType] = useState('all');
  const [search, setSearch] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['bid-projects-list'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_projects')
        .select('*, parking_lots(code, name)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Count submissions per project
  const { data: submissionCounts } = useQuery({
    queryKey: ['bid-submission-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_submissions').select('bid_project_id');
      const counts: Record<string, number> = {};
      data?.forEach(s => { counts[s.bid_project_id] = (counts[s.bid_project_id] || 0) + 1; });
      return counts;
    },
  });

  const activeStatuses = ['draft', 'review', 'announced', 'bidding', 'evaluation', 'awarded'];
  const completeStatuses = ['contracted'];
  const cancelStatuses = ['cancelled', 'failed', 'rebid'];

  const filtered = projects?.filter(p => {
    if (statusTab === 'active' && !activeStatuses.includes(p.status)) return false;
    if (statusTab === 'complete' && !completeStatuses.includes(p.status)) return false;
    if (statusTab === 'cancel' && !cancelStatuses.includes(p.status)) return false;
    if (bidType !== 'all' && p.bid_type !== bidType) return false;
    if (search && !p.title.includes(search) && !p.bid_number.includes(search)) return false;
    return true;
  }) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">입찰 사업</h1>
          <Button onClick={() => navigate('/procurement/projects/new')}>
            <Plus className="h-4 w-4 mr-1" />사업 등록
          </Button>
        </div>

        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="all">전체 ({projects?.length || 0})</TabsTrigger>
              <TabsTrigger value="active">진행중 ({projects?.filter(p => activeStatuses.includes(p.status)).length || 0})</TabsTrigger>
              <TabsTrigger value="complete">완료 ({projects?.filter(p => completeStatuses.includes(p.status)).length || 0})</TabsTrigger>
              <TabsTrigger value="cancel">취소/유찰 ({projects?.filter(p => cancelStatuses.includes(p.status)).length || 0})</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Select value={bidType} onValueChange={setBidType}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체방식</SelectItem>
                  {Object.entries(BID_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-48" placeholder="사업명/공고번호" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </div>

          <TabsContent value={statusTab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>공고번호</TableHead>
                        <TableHead>사업명</TableHead>
                        <TableHead>입찰방식</TableHead>
                        <TableHead>계약유형</TableHead>
                        <TableHead className="text-right">추정가격</TableHead>
                        <TableHead>공고일</TableHead>
                        <TableHead>마감일</TableHead>
                        <TableHead className="text-center">참여</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(p => (
                        <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/procurement/projects/${p.id}`)}>
                          <TableCell className="font-mono text-sm">{p.bid_number}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{p.title}</TableCell>
                          <TableCell><Badge className={`${BID_TYPE_COLORS[p.bid_type]} text-[10px]`}>{BID_TYPE_LABELS[p.bid_type]}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{CONTRACT_TYPE_LABELS[p.contract_type] || p.contract_type}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{formatOkWon(p.estimated_amount)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{p.announce_date || '-'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{p.bid_deadline?.split('T')[0] || '-'}</TableCell>
                          <TableCell className="text-center text-sm">{submissionCounts?.[p.id] || 0}</TableCell>
                          <TableCell><Badge className={`${BID_STATUS_COLORS[p.status]} text-[10px]`}>{BID_STATUS_LABELS[p.status]}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">입찰 사업이 없습니다</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
