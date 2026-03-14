import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ISSUE_TYPE_LABELS, SEVERITY_LABELS, SEVERITY_COLORS,
  ISSUE_STATUS_LABELS, formatServiceAmount,
} from "@/types/service";

export default function ServiceIssues() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");

  const { data: issues } = useQuery({
    queryKey: ["service-issues-all"],
    queryFn: async () => {
      const { data } = await supabase.from("service_issues")
        .select("*, service_projects(title, project_number)")
        .order("reported_at", { ascending: false });
      return data || [];
    },
  });

  const all = issues || [];
  const openCount = all.filter(i => ["open", "in_progress"].includes(i.status)).length;
  const criticalCount = all.filter(i => i.severity === "critical" && !["resolved", "closed"].includes(i.status)).length;
  const totalImpact = all.filter(i => !["resolved", "closed"].includes(i.status)).reduce((s, i) => s + (i.impact_amount || 0), 0);

  const filtered = all.filter(i => {
    if (tab === "open") return ["open", "in_progress", "pending_approval"].includes(i.status);
    if (tab === "resolved") return ["resolved", "closed"].includes(i.status);
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">이슈 관리</h2>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">미해결</p><p className="text-2xl font-bold">{openCount}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-destructive">긴급</p><p className="text-2xl font-bold text-destructive">{criticalCount}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">금액 영향 합계</p><p className="text-lg font-bold">{formatServiceAmount(totalImpact)}</p></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="open">미해결</TabsTrigger>
            <TabsTrigger value="resolved">해결</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead>
                    <TableHead>사업명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>심각도</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="text-right">금액영향</TableHead>
                    <TableHead className="text-right">일정영향</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(i => (
                    <TableRow key={i.id}
                      className={`cursor-pointer hover:bg-muted/50 ${i.severity === "critical" && !["resolved", "closed"].includes(i.status) ? "bg-destructive/5" : ""}`}
                      onClick={() => navigate(`/service/projects/${i.project_id}`)}>
                      <TableCell className="text-xs font-mono">{i.issue_number}</TableCell>
                      <TableCell className="text-sm">{(i.service_projects as any)?.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ISSUE_TYPE_LABELS[i.issue_type] || i.issue_type}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[i.severity]}`}>{SEVERITY_LABELS[i.severity]}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{i.title}</TableCell>
                      <TableCell className="text-right text-sm">{i.impact_amount ? formatServiceAmount(i.impact_amount) : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{i.impact_days ? `${i.impact_days}일` : "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ISSUE_STATUS_LABELS[i.status] || i.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">이슈 없음</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
