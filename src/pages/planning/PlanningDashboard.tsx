import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, HardHat, FileSearch, Car } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NaverMap, type MapMarker } from "@/components/common/NaverMap";
import {
  SITE_STATUS_LABELS, SITE_STATUS_COLORS, PHASE_LABELS, PHASE_ORDER,
  CONSTRUCTION_STATUS_COLORS, PROJECT_TYPE_LABELS, getSiteGrade, getSiteGradeColor, formatBudgetWon,
} from "@/types/planning";

export default function PlanningDashboard() {
  const navigate = useNavigate();

  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ["planning-sites-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_candidates")
        .select("id, site_number, name, area_sqm, estimated_spaces, total_score, bc_ratio, status, ranking, latitude, longitude")
        .order("total_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: projects, isLoading: projLoading } = useQuery({
    queryKey: ["planning-projects-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_projects")
        .select("id, project_number, project_name, project_type, phase, status, progress_pct, permits_completed, permits_total, total_budget, spent, target_completion")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: permits } = useQuery({
    queryKey: ["planning-permits-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permits")
        .select("id")
        .in("status", ["submitted", "reviewing"]);
      if (error) throw error;
      return data || [];
    },
  });

  const loading = sitesLoading || projLoading;
  const sitesByStatus = (status: string) => (sites || []).filter(s => s.status === status).length;
  const inProgressProjects = (projects || []).filter(p => p.status === "in_progress");
  const estimatedSpaces = (sites || []).filter(s => ["selected", "construction"].includes(s.status))
    .reduce((sum, s) => sum + (s.estimated_spaces || 0), 0)
    + inProgressProjects.reduce((sum, p) => sum + 0, 0);
  const top5Sites = (sites || []).slice(0, 5);

  const STATUS_MARKER_COLORS: Record<string, "blue" | "green" | "orange" | "red" | "gray"> = {
    candidate: "blue",
    evaluating: "orange",
    selected: "green",
    rejected: "red",
    construction: "orange",
  };

  const mapMarkers: MapMarker[] = (sites || [])
    .filter((s) => s.latitude && s.longitude)
    .map((s) => ({
      id: s.id,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      name: s.name,
      color: STATUS_MARKER_COLORS[s.status] || "gray",
      label: s.total_score ? Number(s.total_score).toFixed(0) : undefined,
      onClick: () => navigate("/planning/sites"),
    }));

  const kpis = [
    { label: "후보부지", value: (sites || []).length, sub: `후보 ${sitesByStatus("candidate")} | 평가중 ${sitesByStatus("evaluating")} | 선정 ${sitesByStatus("selected")}`, icon: MapPin, color: "text-blue-600" },
    { label: "진행중 공사", value: inProgressProjects.length, sub: "현재 진행중인 공사", icon: HardHat, color: "text-orange-600" },
    { label: "인허가 대기", value: (permits || []).length, sub: "제출/심사중", icon: FileSearch, color: "text-purple-600" },
    { label: "예상 확충 면수", value: estimatedSpaces, sub: "선정+공사중 부지", icon: Car, color: "text-green-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">신설기획 현황</h1>
          <p className="text-sm text-muted-foreground mt-1">후보부지 평가 및 공사 진행 현황</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                    {loading ? <Skeleton className="h-8 w-16 mt-1" /> : (
                      <p className="text-2xl font-bold mt-1">{kpi.value.toLocaleString()}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 후보부지 지도 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">후보부지 위치</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-lg">
            <NaverMap
              markers={mapMarkers}
              height="400px"
              zoom={12}
            />
          </CardContent>
        </Card>

        {/* Bottom 2-col */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 5 Sites */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">후보부지 TOP 5</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">순위</TableHead>
                      <TableHead>부지명</TableHead>
                      <TableHead className="text-right">면적</TableHead>
                      <TableHead className="text-right">면수</TableHead>
                      <TableHead className="text-right">총점</TableHead>
                      <TableHead className="text-right">B/C</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top5Sites.map((s, i) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/planning/sites`)}>
                        <TableCell className="font-bold">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right text-xs">{s.area_sqm ? `${Number(s.area_sqm).toLocaleString()}㎡` : '-'}</TableCell>
                        <TableCell className="text-right">{s.estimated_spaces || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={getSiteGradeColor(Number(s.total_score))} variant="outline">
                            {s.total_score ? Number(s.total_score).toFixed(0) : '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs">{s.bc_ratio ? Number(s.bc_ratio).toFixed(2) : '-'}</TableCell>
                        <TableCell>
                          <Badge className={SITE_STATUS_COLORS[s.status] || ''} variant="outline">
                            {SITE_STATUS_LABELS[s.status] || s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {top5Sites.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">등록된 후보부지가 없습니다</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Construction Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">공사 진행 현황</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : inProgressProjects.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">진행중인 공사가 없습니다</p>
              ) : (
                inProgressProjects.slice(0, 5).map((p) => {
                  const phaseIdx = PHASE_ORDER.indexOf(p.phase);
                  return (
                    <div key={p.id} className="border rounded-lg p-3 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate(`/planning/projects/${p.id}`)}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{p.project_name}</span>
                        <Badge variant="outline" className="text-[10px]">{PROJECT_TYPE_LABELS[p.project_type] || p.project_type}</Badge>
                      </div>
                      {/* Mini phase steps */}
                      <div className="flex gap-0.5">
                        {PHASE_ORDER.map((ph, i) => (
                          <div key={ph} className={`h-1.5 flex-1 rounded-full ${i <= phaseIdx ? 'bg-primary' : 'bg-muted'}`} title={PHASE_LABELS[ph]} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>진척률 {Number(p.progress_pct).toFixed(0)}%</span>
                        <span>인허가 {p.permits_completed}/{p.permits_total}</span>
                      </div>
                      <Progress value={Number(p.progress_pct)} className="h-1.5" />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
