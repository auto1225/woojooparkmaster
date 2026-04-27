import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS, formatServiceAmount } from "@/types/service";

export default function ServicePayments() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");

  const { data: payments } = useQuery({
    queryKey: ["service-payments-all"],
    queryFn: async () => {
      const { data } = await supabase.from("service_payments")
        .select("*, service_projects(title, project_number)")
        .order("request_date", { ascending: false });
      return data || [];
    },
  });

  const all = payments || [];
  const pending = all.filter(p => ["requested", "reviewing", "approved"].includes(p.status));
  const pendingAmount = pending.reduce((s, p) => s + (p.net_amount || 0), 0);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const paidThisMonth = all.filter(p => p.status === "paid" && p.paid_date && p.paid_date >= monthStart);
  const paidAmount = paidThisMonth.reduce((s, p) => s + (p.paid_amount || p.net_amount || 0), 0);
  const delayed = all.filter(p => p.is_delayed);
  const delayInterest = delayed.reduce((s, p) => s + (p.delay_interest || 0), 0);

  const filtered = all.filter(p => {
    if (tab === "pending") return ["requested", "reviewing", "approved"].includes(p.status);
    if (tab === "paid") return p.status === "paid";
    if (tab === "delayed") return p.is_delayed;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">대가지급</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">미지급</p><p className="text-lg font-bold">{formatServiceAmount(pendingAmount)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">이번 달 지급</p><p className="text-lg font-bold">{formatServiceAmount(paidAmount)}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-destructive">지연 건수</p><p className="text-lg font-bold text-destructive">{delayed.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">지연이자 합계</p><p className="text-lg font-bold">{formatServiceAmount(delayInterest)}</p></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="pending">미지급</TabsTrigger>
            <TabsTrigger value="paid">지급완료</TabsTrigger>
            <TabsTrigger value="delayed">지연</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>지급번호</TableHead>
                    <TableHead>사업명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>차수</TableHead>
                    <TableHead className="text-right">청구금액</TableHead>
                    <TableHead className="text-right">공제</TableHead>
                    <TableHead className="text-right">실지급액</TableHead>
                    <TableHead>청구일</TableHead>
                    <TableHead>지급기한</TableHead>
                    <TableHead>지급일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>지연</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}
                      className={`cursor-pointer hover:bg-muted/50 ${p.is_delayed ? "bg-destructive/5" : ""}`}
                      onClick={() => navigate(`/service/projects/${p.project_id}`)}>
                      <TableCell className="text-xs font-mono">{p.payment_number}</TableCell>
                      <TableCell className="text-sm">{(p.service_projects as any)?.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}</Badge></TableCell>
                      <TableCell className="text-sm">{p.payment_seq}차</TableCell>
                      <TableCell className="text-right text-sm">{formatServiceAmount(p.gross_amount)}</TableCell>
                      <TableCell className="text-right text-sm">{formatServiceAmount((p.advance_deduction || 0) + (p.other_deduction || 0))}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatServiceAmount(p.net_amount || 0)}</TableCell>
                      <TableCell className="text-xs">{p.request_date}</TableCell>
                      <TableCell className="text-xs">{p.due_date || "-"}</TableCell>
                      <TableCell className="text-xs">{p.paid_date || "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{PAYMENT_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                      <TableCell>{p.is_delayed ? <Badge variant="outline" className="text-[10px] text-destructive">D+{p.delay_days}일</Badge> : "-"}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">지급 내역 없음</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
