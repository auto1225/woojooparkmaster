import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  FileText, Search, Star, Settings, Wrench, Banknote, Calculator,
  MessageSquare, MapPin, Zap, BarChart3, Download, RefreshCw, Loader2, Clock,
} from "lucide-react";
import {
  REPORT_TYPE_LABELS, REPORT_CATEGORY_LABELS, AUDIENCE_LABELS,
  REPORT_STATUS_LABELS, type ReportTemplate,
} from "@/types/report";

const CATEGORY_ICON_MAP: Record<string, any> = {
  operation: Settings, facility: Wrench, revenue: Banknote, budget: Calculator,
  complaint: MessageSquare, planning: MapPin, realtime: Zap, comprehensive: BarChart3,
};

const CATEGORIES = [
  { key: "__all__", label: "전체" },
  { key: "operation", label: "운영" },
  { key: "facility", label: "시설" },
  { key: "revenue", label: "수입" },
  { key: "budget", label: "예산" },
  { key: "complaint", label: "민원" },
  { key: "planning", label: "기획" },
  { key: "realtime", label: "실시간" },
  { key: "comprehensive", label: "종합" },
];

export default function ReportCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: licenses } = useModuleLicenses();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");

  const activeModules = new Set(
    (licenses ?? []).filter((m) => m.is_active).map((m) => m.module_code)
  );

  const { data: templates, isLoading } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any as ReportTemplate[];
    },
  });

  const { data: recentReports } = useQuery({
    queryKey: ["recent-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_generated")
        .select("*, template:report_templates(name, template_code)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: nextSchedule } = useQuery({
    queryKey: ["next-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_schedules")
        .select("*, template:report_templates(name)")
        .eq("is_active", true)
        .not("next_run", "is", null)
        .order("next_run")
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from("report_templates").update({ is_favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report-templates"] }),
  });

  const isTemplateAvailable = (t: ReportTemplate) => {
    const required = Array.isArray(t.required_modules) ? t.required_modules : [];
    return required.every((m: string) => activeModules.has(m));
  };

  const filtered = (templates ?? []).filter((t) => {
    if (search && !t.name.includes(search) && !t.description?.includes(search)) return false;
    if (category !== "__all__" && t.report_category !== category) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">보고서 센터</h1>
          <Button variant="outline" size="sm" asChild>
            <Link to="/reports/history">보고서 이력</Link>
          </Button>
        </div>

        {nextSchedule && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <Clock className="h-4 w-4 text-accent shrink-0" />
            <span className="text-sm">
              다음 정기 보고서: <strong>{(nextSchedule as any).template?.name}</strong>
              {nextSchedule.next_run && ` — ${new Date(nextSchedule.next_run).toLocaleDateString("ko-KR")} 자동 생성 예정`}
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="보고서 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="flex-wrap h-auto gap-1">
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.key} value={c.key} className="text-xs">{c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((t) => {
              const available = isTemplateAvailable(t);
              const Icon = CATEGORY_ICON_MAP[t.report_category] || FileText;
              return (
                <Card key={t.id} className={`relative ${!available ? "opacity-50" : "hover:shadow-md transition-shadow"}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <button
                        onClick={() => favoriteMutation.mutate({ id: t.id, is_favorite: !t.is_favorite })}
                        className="text-muted-foreground hover:text-warning transition-colors"
                      >
                        <Star className={`h-4 w-4 ${t.is_favorite ? "fill-warning text-warning" : ""}`} />
                      </button>
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{t.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      <Badge variant="outline" className="text-[10px]">{REPORT_TYPE_LABELS[t.report_type] || t.report_type}</Badge>
                      {t.target_audience && (
                        <Badge variant="secondary" className="text-[10px]">{AUDIENCE_LABELS[t.target_audience] || t.target_audience}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {(Array.isArray(t.required_modules) ? t.required_modules : []).map((m: string) => (
                        <Badge key={m} variant="outline" className={`text-[9px] ${activeModules.has(m) ? "border-green-300 text-green-700" : "border-muted text-muted-foreground"}`}>
                          {m}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!available}
                      onClick={() => navigate(`/reports/generate?template=${t.template_code}`)}
                    >
                      {available ? "생성" : "필요 모듈 비활성"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {recentReports && recentReports.length > 0 && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">최근 보고서</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/reports/history">전체 보기</Link></Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentReports.map((r: any) => {
                  const st = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: "bg-muted" };
                  return (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.period_start && `${r.period_start} ~ ${r.period_end}`}
                          {" · "}
                          {new Date(r.created_at).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                        {r.status === "completed" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                        )}
                        {r.status === "failed" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw className="h-3.5 w-3.5" /></Button>
                        )}
                        {r.status === "generating" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
