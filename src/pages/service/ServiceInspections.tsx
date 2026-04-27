import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INSPECTION_TYPE_LABELS, INSPECTION_STATUS_LABELS, RESULT_LABELS, RESULT_COLORS, formatServiceAmount } from "@/types/service";

export default function ServiceInspections() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");

  const { data: inspections } = useQuery({
    queryKey: ["service-inspections-all"],
    queryFn: async () => {
      const { data } = await supabase.from("service_inspections")
        .select("*, service_projects(title, project_number)")
        .order("inspection_date", { ascending: false });
      return data || [];
    },
  });

  const all = inspections || [];
  const pendingCount = all.filter(i => i.status === "pending").length;
  const correctionCount = all.filter(i => i.status === "correction_required").length;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const approvedThisMonth = all.filter(i => i.status === "approved" && i.approved_at && i.approved_at >= monthStart);
  const approvedAmount = approvedThisMonth.reduce((s, i) => s + (i.approved_amount || 0), 0);

  const filtered = all.filter(i => {
    if (tab === "pending") return i.status === "pending";
    if (tab === "correction") return ["correction_required", "correction_submitted"].includes(i.status);
    if (tab === "done") return i.status === "approved";
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">검수 관리</h2>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">대기</p><p className="text-2xl font-bold">{pendingCount}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-orange-600">보완요구</p><p className="text-2xl font-bold text-orange-600">{correctionCount}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">이번 달 완료</p><p className="text-lg font-bold">{approvedThisMonth.length}건 / {formatServiceAmount(approvedAmount)}</p></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="pending">대기</TabsTrigger>
            <TabsTrigger value="correction">보완중</TabsTrigger>
            <TabsTrigger value="done">완료</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>검수번호</TableHead>
                    <TableHead>사업명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>차수</TableHead>
                    <TableHead>검수일</TableHead>
                    <TableHead className="text-right">대상금액</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(i => (
                    <TableRow key={i.id} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/service/projects/${i.project_id}`)}>
                      <TableCell className="text-xs font-mono">{i.inspection_number}</TableCell>
                      <TableCell className="text-sm">{(i.service_projects as any)?.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{INSPECTION_TYPE_LABELS[i.inspection_type] || i.inspection_type}</Badge></TableCell>
                      <TableCell className="text-sm">{i.inspection_seq}차</TableCell>
                      <TableCell className="text-sm">{i.inspection_date}</TableCell>
                      <TableCell className="text-right text-sm">{formatServiceAmount(i.target_amount)}</TableCell>
                      <TableCell>{i.result ? <Badge variant="outline" className={`text-[10px] ${RESULT_COLORS[i.result] || ''}`}>{RESULT_LABELS[i.result] || i.result}</Badge> : "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{INSPECTION_STATUS_LABELS[i.status] || i.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">검수 내역 없음</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
