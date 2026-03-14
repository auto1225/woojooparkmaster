import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Briefcase, ClipboardCheck, Banknote, AlertTriangle, Shield } from "lucide-react";
import {
  SERVICE_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  formatServiceAmount,
} from "@/types/service";

export default function ServiceDashboard() {
  const navigate = useNavigate();

  const { data: projects } = useQuery({
    queryKey: ["service-projects-all"],
    queryFn: async () => {
      const { data } = await supabase.from("service_projects")
        .select("*, parking_lots(code, name)")
        .order("updated_at", { ascending: false });
      return data || [];
    },
  });

  const { data: pendingInspections } = useQuery({
    queryKey: ["service-pending-inspections"],
    queryFn: async () => {
      const { data } = await supabase.from("service_inspections").select("id").eq("status", "pending");
      return data?.length || 0;
    },
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ["service-pending-payments"],
    queryFn: async () => {
      const { data } = await supabase.from("service_payments").select("id").in("status", ["requested", "reviewing", "approved"]);
      return data?.length || 0;
    },
  });

  const { data: openIssues } = useQuery({
    queryKey: ["service-open-issues"],
    queryFn: async () => {
      const { data } = await supabase.from("service_issues").select("id").in("status", ["open", "in_progress"]);
      return data?.length || 0;
    },
  });

  const inProgress = projects?.filter(p => p.status === "in_progress") || [];
  const warrantyCount = projects?.filter(p => p.status === "warranty").length || 0;

  const now = new Date();
  const soon30 = new Date(now.getTime() + 30 * 86400000);
  const soon60 = new Date(now.getTime() + 60 * 86400000);

  const endingSoon = (projects || []).filter(p =>
    p.status === "in_progress" && new Date(p.end_date) <= soon30 && new Date(p.end_date) >= now
  );
  const warrantyEnding = (projects || []).filter(p =>
    p.status === "warranty" && p.warranty_end && new Date(p.warranty_end) <= soon60 && new Date(p.warranty_end) >= now
  );

  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000);

  const kpis = [
    { label: "진행중 사업", value: inProgress.length, icon: Briefcase, color: "text-blue-600" },
    { label: "검수 대기", value: pendingInspections || 0, icon: ClipboardCheck, color: "text-orange-600" },
    { label: "지급 대기", value: pendingPayments || 0, icon: Banknote, color: "text-purple-600" },
    { label: "미해결 이슈", value: openIssues || 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "하자보증 중", value: warrantyCount, icon: Shield, color: "text-green-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h2 className="text-xl font-bold">용역사업 현황</h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">진행중 사업</h3>
          {inProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">진행중인 사업이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inProgress.map(p => {
                const remaining = daysUntil(p.extended_end_date || p.end_date);
                return (
                  <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/service/projects/${p.id}`)}>
                    <CardContent className="pt-4 pb-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm truncate">{p.title}</h4>
                          <p className="text-xs text-muted-foreground">{p.contractor_name}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Badge variant="outline" className="text-[10px]">{SERVICE_TYPE_LABELS[p.service_type] || p.service_type}</Badge>
                          <Badge variant="outline" className={`text-[10px] ${PROJECT_STATUS_COLORS[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>진척률</span>
                          <span className="font-medium">{Number(p.progress_pct || 0).toFixed(0)}%</span>
                        </div>
                        <Progress value={Number(p.progress_pct || 0)} className="h-2" />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{p.start_date} ~ {p.extended_end_date || p.end_date}</span>
                        <span className={remaining < 0 ? "text-destructive font-medium" : remaining <= 30 ? "text-orange-600 font-medium" : ""}>
                          {remaining < 0 ? `D+${Math.abs(remaining)}일` : `D-${remaining}일`}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>총액 {formatServiceAmount(p.total_amount)}</span>
                        <span>지급 {formatServiceAmount(p.paid_amount || 0)}</span>
                        <span>잔액 {formatServiceAmount(p.remaining_amount || 0)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">완료 임박 (30일 이내)</CardTitle></CardHeader>
            <CardContent>
              {endingSoon.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">해당 없음</p>
              ) : (
                <div className="space-y-2">
                  {endingSoon.map(p => (
                    <div key={p.id} className="flex justify-between items-center text-sm cursor-pointer hover:bg-muted/50 rounded p-1.5"
                      onClick={() => navigate(`/service/projects/${p.id}`)}>
                      <div>
                        <p className="font-medium text-xs">{p.title}</p>
                        <p className="text-[10px] text-muted-foreground">{p.contractor_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs">{p.end_date}</p>
                        <Badge variant="outline" className="text-[10px] text-orange-600">D-{daysUntil(p.end_date)}일</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">하자보증 만료 임박 (60일 이내)</CardTitle></CardHeader>
            <CardContent>
              {warrantyEnding.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">해당 없음</p>
              ) : (
                <div className="space-y-2">
                  {warrantyEnding.map(p => (
                    <div key={p.id} className="flex justify-between items-center text-sm cursor-pointer hover:bg-muted/50 rounded p-1.5"
                      onClick={() => navigate(`/service/projects/${p.id}`)}>
                      <div>
                        <p className="font-medium text-xs">{p.title}</p>
                        <p className="text-[10px] text-muted-foreground">{p.contractor_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs">{p.warranty_end}</p>
                        <Badge variant="outline" className="text-[10px] text-teal-600">D-{daysUntil(p.warranty_end!)}일</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
