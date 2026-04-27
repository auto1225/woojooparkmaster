import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  SERVICE_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, formatServiceAmount,
} from "@/types/service";

const STATUS_TABS = [
  { value: "all", label: "전체" },
  { value: "active", label: "진행중" },
  { value: "inspect", label: "검수/완료" },
  { value: "warranty", label: "하자보증" },
  { value: "closed", label: "종결" },
];

export default function ServiceProjects() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canCreate = profile && ["admin", "manager", "editor"].includes(profile.role);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: projects } = useQuery({
    queryKey: ["service-projects"],
    queryFn: async () => {
      const { data } = await supabase.from("service_projects")
        .select("*, parking_lots(code, name), supervisor:profiles!service_projects_supervisor_id_fkey(name)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const filtered = (projects || []).filter(p => {
    if (tab === "active" && p.status !== "in_progress") return false;
    if (tab === "inspect" && !["inspection", "completed"].includes(p.status)) return false;
    if (tab === "warranty" && p.status !== "warranty") return false;
    if (tab === "closed" && !["closed", "terminated"].includes(p.status)) return false;
    if (typeFilter !== "all" && p.service_type !== typeFilter) return false;
    if (search && !p.title.includes(search) && !p.project_number.includes(search) && !p.contractor_name.includes(search)) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">용역사업 관리</h2>
          {canCreate && (
            <Button size="sm" onClick={() => navigate("/service/projects/new")}>
              <Plus className="h-4 w-4 mr-1" /> 사업 등록
            </Button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="사업명, 번호, 업체 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {STATUS_TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value={tab}>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>사업번호</TableHead>
                      <TableHead>사업명</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>수행업체</TableHead>
                      <TableHead className="text-right">금액</TableHead>
                      <TableHead>기간</TableHead>
                      <TableHead>진척률</TableHead>
                      <TableHead>지급률</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>감독관</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(p => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/service/projects/${p.id}`)}>
                        <TableCell className="text-xs font-mono">{p.project_number}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">{p.title}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{SERVICE_TYPE_LABELS[p.service_type] || p.service_type}</Badge></TableCell>
                        <TableCell className="text-sm">{p.contractor_name}</TableCell>
                        <TableCell className="text-right text-sm">{formatServiceAmount(p.total_amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.start_date}~{p.end_date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[80px]">
                            <Progress value={Number(p.progress_pct || 0)} className="h-1.5 flex-1" />
                            <span className="text-xs">{Number(p.progress_pct || 0).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{Number(p.payment_rate || 0).toFixed(0)}%</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${PROJECT_STATUS_COLORS[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</Badge></TableCell>
                        <TableCell className="text-xs">{(p.supervisor as any)?.name || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">등록된 사업이 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
