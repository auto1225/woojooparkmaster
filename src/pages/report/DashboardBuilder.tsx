import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useModuleLicenses } from "@/hooks/useSystemConfig";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Settings, Trash2, Eye, Edit3, GripVertical, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { WIDGET_TYPE_LABELS, type DashboardWidget } from "@/types/report";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["hsl(211,65%,45%)", "hsl(152,55%,38%)", "hsl(38,92%,50%)", "hsl(280,60%,50%)", "hsl(0,72%,51%)"];

const DATA_SOURCES: Record<string, { label: string; module: string }> = {
  parking_lots: { label: "주차장 현황", module: "CORE" },
  revenue_daily: { label: "수입", module: "REVENUE" },
  surveys: { label: "조사 현황", module: "SURVEY" },
  complaints: { label: "민원", module: "COMPLAINT" },
  equipment: { label: "장비", module: "FACILITY" },
  lot_realtime_status: { label: "실시간", module: "REALTIME" },
  budget_items: { label: "예산", module: "BUDGET" },
};

export default function DashboardBuilder() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: licenses } = useModuleLicenses();
  const [editMode, setEditMode] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dashboardName, setDashboardName] = useState("default");
  const [widgetForm, setWidgetForm] = useState({
    widget_type: "kpi_card",
    title: "",
    data_source: "parking_lots",
    chart_type: "",
    width: 4,
    height: 3,
  });

  const activeModules = new Set(
    (licenses ?? []).filter((m) => m.is_active).map((m) => m.module_code)
  );

  const availableSources = Object.entries(DATA_SOURCES).filter(([, v]) => activeModules.has(v.module));

  const { data: widgets, isLoading } = useQuery({
    queryKey: ["dashboard-widgets", dashboardName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_widgets")
        .select("*")
        .eq("dashboard_name", dashboardName)
        .order("sort_order");
      if (error) throw error;
      return data as any as DashboardWidget[];
    },
    enabled: !!user,
  });

  // Create default widgets on first visit
  const initMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const defaults = [
        { widget_type: "kpi_card", title: "총 주차장", data_source: "parking_lots", data_config: { aggregation: "count" }, width: 3, height: 2, position_x: 0, position_y: 0, sort_order: 0 },
        { widget_type: "kpi_card", title: "총 주차면", data_source: "parking_lots", data_config: { aggregation: "sum", field: "total_spaces" }, width: 3, height: 2, position_x: 3, position_y: 0, sort_order: 1 },
        { widget_type: "kpi_card", title: "운영중 주차장", data_source: "parking_lots", data_config: { aggregation: "count", filter: { status: "active" } }, width: 3, height: 2, position_x: 6, position_y: 0, sort_order: 2 },
        { widget_type: "donut_chart", title: "유형별 분포", data_source: "parking_lots", data_config: { aggregation: "count", group_by: "lot_type" }, chart_type: "donut", width: 4, height: 4, position_x: 0, position_y: 2, sort_order: 3 },
        { widget_type: "table", title: "최근 활동", data_source: "parking_lots", data_config: { table: "activity_logs", limit: 5 }, width: 8, height: 4, position_x: 4, position_y: 2, sort_order: 4 },
      ];
      const { error } = await supabase.from("dashboard_widgets").insert(
        defaults.map((d) => ({ ...d, user_id: user.id, dashboard_name: "default", is_visible: true }))
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] }),
  });

  useEffect(() => {
    if (widgets !== undefined && widgets.length === 0 && dashboardName === "default") {
      initMutation.mutate();
    }
  }, [widgets]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("dashboard_widgets").insert({
        user_id: user.id,
        dashboard_name: dashboardName,
        widget_type: widgetForm.widget_type,
        title: widgetForm.title,
        data_source: widgetForm.data_source,
        data_config: { aggregation: "count" },
        chart_type: widgetForm.chart_type || null,
        width: widgetForm.width,
        height: widgetForm.height,
        position_x: 0,
        position_y: (widgets?.length || 0) * 3,
        is_visible: true,
        sort_order: widgets?.length || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] });
      setDialogOpen(false);
      toast.success("위젯이 추가되었습니다");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dashboard_widgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] });
      toast.success("위젯이 삭제되었습니다");
    },
  });

  // Simple widget renderer
  const renderWidget = (w: DashboardWidget) => {
    const colSpan = `col-span-${Math.min(w.width, 12)}`;
    
    if (w.widget_type === "kpi_card") {
      return (
        <Card key={w.id} className={colSpan}>
          <CardContent className="p-4">
            {editMode && (
              <div className="flex justify-end gap-1 mb-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMutation.mutate(w.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-1">{w.title}</p>
            <p className="text-2xl font-bold">—</p>
            <p className="text-[10px] text-muted-foreground mt-1">{DATA_SOURCES[w.data_source]?.label || w.data_source}</p>
          </CardContent>
        </Card>
      );
    }

    if (w.widget_type === "donut_chart" || w.widget_type === "pie_chart") {
      const demoData = [{ name: "노상", value: 3 }, { name: "노외", value: 5 }, { name: "부설", value: 2 }];
      return (
        <Card key={w.id} className={colSpan}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground">{w.title}</CardTitle>
            {editMode && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMutation.mutate(w.id)}><Trash2 className="h-3 w-3" /></Button>}
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={demoData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={2}>
                  {demoData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={w.id} className={colSpan}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-xs text-muted-foreground">{w.title}</CardTitle>
          {editMode && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMutation.mutate(w.id)}><Trash2 className="h-3 w-3" /></Button>}
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
            {WIDGET_TYPE_LABELS[w.widget_type] || w.widget_type}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">대시보드 빌더</h1>
            <Badge variant="outline">{dashboardName === "default" ? "기본" : dashboardName}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={editMode ? "default" : "outline"} size="sm" onClick={() => setEditMode(!editMode)}>
              {editMode ? <><Eye className="h-4 w-4 mr-1" />미리보기</> : <><Edit3 className="h-4 w-4 mr-1" />편집</>}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />위젯 추가</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>위젯 추가</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>위젯 유형</Label>
                    <Select value={widgetForm.widget_type} onValueChange={(v) => setWidgetForm({ ...widgetForm, widget_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(WIDGET_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>제목</Label><Input value={widgetForm.title} onChange={(e) => setWidgetForm({ ...widgetForm, title: e.target.value })} placeholder="위젯 제목" /></div>
                  <div>
                    <Label>데이터 소스</Label>
                    <Select value={widgetForm.data_source} onValueChange={(v) => setWidgetForm({ ...widgetForm, data_source: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{availableSources.map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>폭 (1~12)</Label><Input type="number" min={1} max={12} value={widgetForm.width} onChange={(e) => setWidgetForm({ ...widgetForm, width: Number(e.target.value) })} /></div>
                    <div><Label>높이 (1~6)</Label><Input type="number" min={1} max={6} value={widgetForm.height} onChange={(e) => setWidgetForm({ ...widgetForm, height: Number(e.target.value) })} /></div>
                  </div>
                  <Button className="w-full" onClick={() => addMutation.mutate()} disabled={!widgetForm.title}>추가</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {widgets?.map(renderWidget)}
        </div>

        {(!widgets || widgets.length === 0) && !isLoading && (
          <div className="py-12 text-center text-muted-foreground text-sm">위젯을 추가하여 대시보드를 구성하세요</div>
        )}
      </div>
    </DashboardLayout>
  );
}
