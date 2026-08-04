import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
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
import { AlertCircle, Database, Edit3, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { WIDGET_TYPE_LABELS, type DashboardWidget } from "@/types/report";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { isModuleEnabled } from "@/lib/authorization";

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

const ALLOWED_TABLES = new Set([...Object.keys(DATA_SOURCES), "activity_logs"]);
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const PAGE_SIZE = 1000;
const MAX_AGGREGATION_ROWS = 100000;

const DEFAULT_GROUP_FIELDS: Record<string, string> = {
  parking_lots: "lot_type",
  revenue_daily: "revenue_date",
  surveys: "status",
  complaints: "category",
  equipment: "equipment_type",
  lot_realtime_status: "status",
  budget_items: "category_l1",
};

const TABLE_DEFAULTS: Record<string, { fields: string[]; orderBy: string }> = {
  activity_logs: { fields: ["created_at", "user_name", "module", "action", "target_name"], orderBy: "created_at" },
  parking_lots: { fields: ["created_at", "code", "name", "lot_type", "status"], orderBy: "created_at" },
  revenue_daily: { fields: ["revenue_date", "total_amount", "total_vehicles", "data_source", "verified"], orderBy: "revenue_date" },
  surveys: { fields: ["created_at", "survey_type", "survey_date", "status", "notes"], orderBy: "created_at" },
  complaints: { fields: ["received_at", "complaint_number", "title", "category", "status"], orderBy: "received_at" },
  equipment: { fields: ["created_at", "equipment_code", "name", "equipment_type", "status"], orderBy: "created_at" },
  lot_realtime_status: { fields: ["last_updated", "total_spaces", "occupied_spaces", "available_spaces", "congestion_level"], orderBy: "last_updated" },
  budget_items: { fields: ["created_at", "item_code", "item_name", "budget_type", "allocated_amount", "executed_amount"], orderBy: "created_at" },
};

const FIELD_LABELS: Record<string, string> = {
  created_at: "일시",
  user_name: "사용자",
  module: "업무",
  action: "작업",
  target_name: "대상",
  name: "명칭",
  code: "코드",
  status: "상태",
  title: "제목",
  complaint_number: "민원번호",
  revenue_date: "수입일",
  total_amount: "금액",
  lot_type: "주차장 유형",
  category: "분류",
  equipment_type: "장비 종류",
};

const GROUP_LABELS: Record<string, string> = {
  on_street: "노상주차장",
  off_street: "노외주차장",
  onstreet: "노상주차장",
  offstreet: "노외주차장",
  parking_building: "주차빌딩",
  building: "주차빌딩",
  multilevel: "주차빌딩",
  attached: "부설주차장",
  active: "운영",
  inactive: "미운영",
  received: "접수",
  assigned: "배정",
  processing: "처리 중",
  completed: "완료",
  closed: "종결",
};

type WidgetConfig = {
  table?: string;
  aggregation?: "count" | "sum";
  field?: string;
  group_by?: string;
  filter?: Record<string, unknown>;
  filters?: Array<{ field: string; operator?: string; value: unknown }>;
  fields?: string[];
  limit?: number;
  order_by?: string;
  order_direction?: "asc" | "desc";
  date_field?: string;
  date_from?: string;
  date_to?: string;
  unit?: string;
};

type WidgetResult =
  | { kind: "metric"; value: number }
  | { kind: "group"; items: Array<{ name: string; value: number }> }
  | { kind: "table"; rows: Record<string, unknown>[]; fields: string[] };

function assertIdentifier(value: string, label: string) {
  if (!IDENTIFIER_PATTERN.test(value)) throw new Error(`${label} 설정이 올바르지 않습니다.`);
  return value;
}

function applyFilters(query: any, config: WidgetConfig) {
  let next = query;
  Object.entries(config.filter || {}).forEach(([field, value]) => {
    assertIdentifier(field, "필터 필드");
    if (Array.isArray(value)) next = next.in(field, value);
    else if (value === null) next = next.is(field, null);
    else next = next.eq(field, value);
  });

  (config.filters || []).forEach(({ field, operator = "eq", value }) => {
    assertIdentifier(field, "필터 필드");
    if (operator === "in" && Array.isArray(value)) next = next.in(field, value);
    else if (operator === "is") next = next.is(field, value);
    else if (["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"].includes(operator)) {
      next = next[operator](field, value);
    } else {
      throw new Error(`지원하지 않는 필터 연산자입니다: ${operator}`);
    }
  });

  if (config.date_field) {
    const dateField = assertIdentifier(config.date_field, "날짜 필드");
    if (config.date_from) next = next.gte(dateField, config.date_from);
    if (config.date_to) next = next.lte(dateField, config.date_to);
  }
  return next;
}

async function fetchAllRows(table: string, fields: string[], config: WidgetConfig) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX_AGGREGATION_ROWS; from += PAGE_SIZE) {
    let query = (supabase.from(table as any) as any).select(fields.join(",")).range(from, from + PAGE_SIZE - 1);
    query = applyFilters(query, config);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error("집계 대상이 10만 건을 초과했습니다. 기간 또는 조건을 좁혀 주세요.");
}

async function loadWidgetData(widget: DashboardWidget): Promise<WidgetResult> {
  const config = (widget.data_config || {}) as WidgetConfig;
  const table = config.table || widget.data_source;
  if (!ALLOWED_TABLES.has(table)) throw new Error(`허용되지 않은 데이터 소스입니다: ${table}`);

  const isTable = widget.widget_type === "table" || widget.chart_type === "table";
  if (isTable) {
    const defaults = TABLE_DEFAULTS[table];
    const fields = (config.fields?.length ? config.fields : defaults.fields)
      .map((field) => assertIdentifier(field, "표시 필드"));
    const limit = Math.min(Math.max(Number(config.limit) || 5, 1), 100);
    const orderBy = assertIdentifier(config.order_by || defaults.orderBy, "정렬 필드");
    let query = (supabase.from(table as any) as any)
      .select(fields.join(","))
      .order(orderBy, { ascending: config.order_direction === "asc" })
      .limit(limit);
    query = applyFilters(query, config);
    const { data, error } = await query;
    if (error) throw error;
    return { kind: "table", rows: (data || []) as Record<string, unknown>[], fields };
  }

  const isChart = ["chart", "bar_chart", "line_chart", "area_chart", "pie_chart", "donut_chart"].includes(widget.widget_type);
  const groupBy = config.group_by || (isChart ? DEFAULT_GROUP_FIELDS[widget.data_source] : undefined);
  const aggregation = config.aggregation || (widget.data_source === "revenue_daily" && !groupBy ? "sum" : "count");
  const sumField = config.field || (widget.data_source === "revenue_daily" ? "total_amount" : undefined);
  if (aggregation === "sum" && !sumField) throw new Error("합계 위젯에는 data_config.field 설정이 필요합니다.");
  const aggregateField = aggregation === "sum" ? assertIdentifier(sumField!, "집계 필드") : undefined;

  if (!groupBy && aggregation === "count") {
    let query = (supabase.from(table as any) as any).select("*", { count: "exact", head: true });
    query = applyFilters(query, config);
    const { count, error } = await query;
    if (error) throw error;
    return { kind: "metric", value: count || 0 };
  }

  const groupField = groupBy ? assertIdentifier(groupBy, "그룹 필드") : undefined;
  const fields = Array.from(new Set([groupField, aggregateField].filter(Boolean))) as string[];
  const rows = await fetchAllRows(table, fields, config);
  if (!groupField) {
    return {
      kind: "metric",
      value: rows.reduce((sum, row) => sum + (Number(row[aggregateField!]) || 0), 0),
    };
  }

  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const rawName = row[groupField];
    const name = rawName === null || rawName === undefined || rawName === "" ? "미분류" : String(rawName);
    const value = aggregation === "sum" ? Number(row[aggregateField!]) || 0 : 1;
    grouped.set(name, (grouped.get(name) || 0) + value);
  });
  return {
    kind: "group",
    items: Array.from(grouped, ([name, value]) => ({ name: GROUP_LABELS[name] || name, value }))
      .sort((a, b) => b.value - a.value),
  };
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }
  return String(value);
}

function WidgetCard({ widget, editMode, onDelete }: { widget: DashboardWidget; editMode: boolean; onDelete: () => void }) {
  const config = (widget.data_config || {}) as WidgetConfig;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-widget-data", widget.id, widget.data_source, widget.data_config],
    queryFn: () => loadWidgetData(widget),
    staleTime: 60_000,
    refetchInterval: widget.data_source === "lot_realtime_status" ? 60_000 : false,
  });
  const span = Math.min(Math.max(Number(widget.width) || 4, 1), 12);
  const colSpan = `col-span-1 ${COL_SPAN_MAP[span] || "md:col-span-4"}`;
  const sourceLabel = DATA_SOURCES[widget.data_source]?.label || widget.data_source;
  const header = (
    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
      <div className="min-w-0">
        <CardTitle className="truncate text-sm">{widget.title}</CardTitle>
        <p className="mt-1 text-[11px] text-muted-foreground">{sourceLabel}</p>
      </div>
      {editMode && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={onDelete} aria-label={`${widget.title} 삭제`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card className={`${colSpan} min-w-0`}>
        {header}
        <CardContent className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 데이터를 불러오는 중입니다
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`${colSpan} min-w-0 border-destructive/40`}>
        {header}
        <CardContent className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 text-center">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm font-medium">데이터를 불러오지 못했습니다</p>
          <p className="max-w-full break-words text-xs text-muted-foreground">{error instanceof Error ? error.message : "알 수 없는 오류"}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>다시 시도</Button>
        </CardContent>
      </Card>
    );
  }

  if (data?.kind === "metric") {
    const formatted = new Intl.NumberFormat("ko-KR").format(data.value);
    return (
      <Card className={`${colSpan} min-w-0`}>
        {header}
        <CardContent className="pt-1">
          <p className="break-words text-2xl font-bold tabular-nums sm:text-3xl">{formatted}{config.unit || ""}</p>
          <p className="mt-2 text-xs text-muted-foreground">실시간 집계 결과</p>
        </CardContent>
      </Card>
    );
  }

  if (data?.kind === "group") {
    if (data.items.length === 0) {
      return <Card className={`${colSpan} min-w-0`}>{header}<EmptyWidgetState /></Card>;
    }
    const usePie = ["pie_chart", "donut_chart"].includes(widget.widget_type) || ["pie", "donut"].includes(widget.chart_type || "");
    return (
      <Card className={`${colSpan} min-w-0 overflow-hidden`}>
        {header}
        <CardContent className="px-2 sm:px-4">
          <ResponsiveContainer width="100%" height={Math.max(180, Math.min((Number(widget.height) || 3) * 55, 330))}>
            {usePie ? (
              <PieChart>
                <Pie data={data.items} cx="50%" cy="50%" innerRadius={widget.widget_type === "donut_chart" || widget.chart_type === "donut" ? 35 : 0} outerRadius={65} dataKey="value" nameKey="name" paddingAngle={2}>
                  {data.items.map((item, index) => <Cell key={`${item.name}-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => new Intl.NumberFormat("ko-KR").format(Number(value))} />
              </PieChart>
            ) : (
              <BarChart data={data.items} margin={{ top: 8, right: 8, bottom: 12, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} height={42} />
                <YAxis tick={{ fontSize: 10 }} width={42} />
                <Tooltip formatter={(value) => new Intl.NumberFormat("ko-KR").format(Number(value))} />
                <Bar dataKey="value" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  if (data?.kind === "table") {
    if (data.rows.length === 0) {
      return <Card className={`${colSpan} min-w-0`}>{header}<EmptyWidgetState /></Card>;
    }
    return (
      <Card className={`${colSpan} min-w-0 overflow-hidden`}>
        {header}
        <CardContent className="px-0 pb-2">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="border-y bg-muted/50 text-muted-foreground">
                <tr>{data.fields.map((field) => <th key={field} className="whitespace-nowrap px-3 py-2 font-medium">{FIELD_LABELS[field] || field}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.map((row, index) => (
                  <tr key={String(row.id || index)}>
                    {data.fields.map((field) => <td key={field} className="max-w-52 truncate px-3 py-2" title={displayValue(row[field])}>{displayValue(row[field])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <Card className={`${colSpan} min-w-0`}>{header}<EmptyWidgetState message="표시할 집계 설정이 없습니다" /></Card>;
}

function EmptyWidgetState({ message = "조건에 해당하는 데이터가 없습니다" }: { message?: string }) {
  return (
    <CardContent className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Database className="h-5 w-5" />
      <p>{message}</p>
    </CardContent>
  );
}

const COL_SPAN_MAP: Record<number, string> = {
  1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4",
  5: "md:col-span-5", 6: "md:col-span-6", 7: "md:col-span-7", 8: "md:col-span-8",
  9: "md:col-span-9", 10: "md:col-span-10", 11: "md:col-span-11", 12: "md:col-span-12",
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
    Object.values(DATA_SOURCES)
      .map((source) => source.module)
      .filter((code) => code === "CORE" || isModuleEnabled(licenses, code))
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
  const initializeDashboard = initMutation.mutate;

  useEffect(() => {
    if (widgets !== undefined && widgets.length === 0 && dashboardName === "default") {
      initializeDashboard();
    }
  }, [dashboardName, initializeDashboard, widgets]);

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
        author_name: (widgetForm as any).author_name || null,
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
                  <AuthorField value={(widgetForm as any).author_name || ""} onChange={v => setWidgetForm(prev => ({ ...prev, author_name: v } as any))} />
                  <Button className="w-full" onClick={() => addMutation.mutate()} disabled={!widgetForm.title}>추가</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading && (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 대시보드 구성을 불러오는 중입니다
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {widgets?.filter((widget) => widget.is_visible).map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              editMode={editMode}
              onDelete={() => deleteMutation.mutate(widget.id)}
            />
          ))}
        </div>

        {(!widgets || widgets.length === 0) && !isLoading && (
          <div className="py-12 text-center text-muted-foreground text-sm">위젯을 추가하여 대시보드를 구성하세요</div>
        )}
      </div>
    </DashboardLayout>
  );
}
