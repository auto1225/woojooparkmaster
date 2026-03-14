import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, CalendarCheck, HardDrive, Download, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { REPORT_STATUS_LABELS } from "@/types/report";

function formatSize(bytes?: number | null) {
  if (!bytes) return "-";
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ReportHistory() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [showArchived, setShowArchived] = useState(false);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["report-history", statusFilter, showArchived],
    queryFn: async () => {
      let q = supabase
        .from("report_generated")
        .select("*, template:report_templates(name, template_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "__all__") q = q.eq("status", statusFilter);
      if (!showArchived) q = q.neq("status", "archived");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_generated").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-history"] });
      toast.success("삭제되었습니다");
    },
  });

  const totalCount = reports?.length || 0;
  const thisMonth = reports?.filter((r) => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length || 0;
  const totalSize = reports?.reduce((s, r) => s + (r.file_size || 0), 0) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">보고서 이력</h1>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">총 보고서</p><p className="text-xl font-bold">{totalCount}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center"><CalendarCheck className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">이번 달 생성</p><p className="text-xl font-bold">{thisMonth}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center"><HardDrive className="h-5 w-5 text-purple-600" /></div>
            <div><p className="text-xs text-muted-foreground">총 용량</p><p className="text-xl font-bold">{formatSize(totalSize)}</p></div>
          </CardContent></Card>
        </div>

        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 상태</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="generating">생성중</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
              <SelectItem value="archived">보관</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "보관함 숨기기" : "보관함 보기"}
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>보고서번호</TableHead>
                  <TableHead>보고서명</TableHead>
                  <TableHead>템플릿</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>형식</TableHead>
                  <TableHead>크기</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : !reports?.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">생성된 보고서가 없습니다</TableCell></TableRow>
                ) : (
                  reports.map((r: any) => {
                    const st = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: "bg-muted" };
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.report_number}</TableCell>
                        <TableCell className="text-sm font-medium">{r.title}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.template?.name || "-"}</Badge></TableCell>
                        <TableCell className="text-xs">{r.period_start ? `${r.period_start}~${r.period_end || ""}` : "-"}</TableCell>
                        <TableCell className="text-xs uppercase">{r.file_format || "pdf"}</TableCell>
                        <TableCell className="text-xs">{formatSize(r.file_size)}</TableCell>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString("ko-KR")}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {r.status === "completed" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                            )}
                            {r.status === "failed" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw className="h-3.5 w-3.5" /></Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
