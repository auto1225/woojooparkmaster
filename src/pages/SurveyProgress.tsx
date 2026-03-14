import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SURVEY_STATUS_LABELS, SURVEY_STATUS_COLORS, SURVEY_TYPE_LABELS } from "@/types/survey";
import type { SurveyStatus } from "@/types/survey";
import { ArrowLeft, Building2, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const STATUS_PIE_COLORS: Record<string, string> = {
  approved: "#22c55e",
  submitted: "#eab308",
  review: "#f97316",
  in_progress: "#3b82f6",
  draft: "#6b7280",
  rejected: "#ef4444",
  none: "#d1d5db",
};

export default function SurveyProgressPage() {
  const navigate = useNavigate();

  const { data: lots } = useQuery({
    queryKey: ["all-lots-for-progress"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
      return data || [];
    },
  });

  const { data: surveys } = useQuery({
    queryKey: ["all-surveys-for-progress"],
    queryFn: async () => {
      const { data } = await supabase.from("surveys").select("id, lot_id, status, survey_type, survey_date, surveyor_id, surveyor:profiles!surveys_surveyor_id_fkey(name)");
      return data || [];
    },
  });

  const totalLots = lots?.length || 0;
  const surveyMap = new Map<string, any>();
  (surveys || []).forEach((s: any) => {
    if (!surveyMap.has(s.lot_id) || s.status === "approved") surveyMap.set(s.lot_id, s);
  });

  const approvedLots = new Set<string>();
  const inProgressLots = new Set<string>();
  (surveys || []).forEach((s: any) => {
    if (s.status === "approved") approvedLots.add(s.lot_id);
    else inProgressLots.add(s.lot_id);
  });
  // Remove from inProgress if approved
  approvedLots.forEach(id => inProgressLots.delete(id));

  const completedCount = approvedLots.size;
  const progressCount = inProgressLots.size;
  const notStarted = totalLots - completedCount - progressCount;
  const completionRate = totalLots > 0 ? (completedCount / totalLots * 100) : 0;

  // Status distribution
  const statusCounts: Record<string, number> = {};
  (surveys || []).forEach((s: any) => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
  if (notStarted > 0) statusCounts["none"] = notStarted;

  const pieData = Object.entries(statusCounts).map(([key, value]) => ({
    name: key === "none" ? "미착수" : SURVEY_STATUS_LABELS[key as SurveyStatus] || key,
    value,
    color: STATUS_PIE_COLORS[key] || "#9ca3af",
  }));

  // Surveyor stats
  const surveyorStats = new Map<string, { name: string; completed: number; inProgress: number; total: number }>();
  (surveys || []).forEach((s: any) => {
    const name = (s.surveyor as any)?.name || "미배정";
    if (!surveyorStats.has(name)) surveyorStats.set(name, { name, completed: 0, inProgress: 0, total: 0 });
    const stat = surveyorStats.get(name)!;
    stat.total++;
    if (s.status === "approved") stat.completed++;
    else stat.inProgress++;
  });

  const isLoading = !lots || !surveys;

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/surveys")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> 조사 목록
        </Button>
        <h2 className="text-xl font-bold">진행률 현황</h2>

        {isLoading ? <Skeleton className="h-40" /> : (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "전체 주차장", value: totalLots, icon: Building2, color: "text-primary" },
                { label: "조사 완료", value: completedCount, icon: CheckCircle, color: "text-success" },
                { label: "진행중", value: progressCount, icon: Clock, color: "text-blue-500" },
                { label: "미착수", value: notStarted, icon: AlertCircle, color: "text-muted-foreground" },
              ].map(k => (
                <Card key={k.label}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <k.icon className={`h-4 w-4 ${k.color}`} />
                      <span className="text-xs text-muted-foreground">{k.label}</span>
                    </div>
                    <p className="text-2xl font-bold">{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Progress Bar */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">전체 진행률</span>
                  <span className="text-sm font-bold">{completionRate.toFixed(1)}%</span>
                </div>
                <Progress value={completionRate} className="h-3" />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pie Chart */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">상태별 분포</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Surveyor Stats */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">조사자별 실적</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>조사자</TableHead>
                        <TableHead className="text-right">완료</TableHead>
                        <TableHead className="text-right">진행중</TableHead>
                        <TableHead className="text-right">합계</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from(surveyorStats.values()).map(s => (
                        <TableRow key={s.name}>
                          <TableCell className="text-sm">{s.name}</TableCell>
                          <TableCell className="text-right text-sm">{s.completed}</TableCell>
                          <TableCell className="text-right text-sm">{s.inProgress}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{s.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Lot List */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs">주차장별 조사 현황</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>코드</TableHead>
                      <TableHead>주차장명</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>조사자</TableHead>
                      <TableHead>조사일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lots?.map((lot: any) => {
                      const s = surveyMap.get(lot.id);
                      return (
                        <TableRow key={lot.id} className="cursor-pointer hover:bg-accent/50" onClick={() => s ? navigate(`/surveys/${s.id}`) : null}>
                          <TableCell className="font-mono text-xs">{lot.code}</TableCell>
                          <TableCell className="text-sm">{lot.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${s ? SURVEY_STATUS_COLORS[s.status as SurveyStatus] : "bg-muted text-muted-foreground"}`}>
                              {s ? SURVEY_STATUS_LABELS[s.status as SurveyStatus] : "미착수"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{s ? (s.surveyor as any)?.name || "-" : "-"}</TableCell>
                          <TableCell className="text-xs">{s?.survey_date || "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
