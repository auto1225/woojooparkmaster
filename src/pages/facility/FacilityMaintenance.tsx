import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, List, Columns3 } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { PRIORITY_LABELS, PRIORITY_COLORS, MAINT_STATUS_LABELS, MAINT_TYPE_LABELS } from "@/types/facility";
import type { MaintenanceLog, MaintenanceLogStatus } from "@/types/facility";
import { MaintenanceLogDetailSheet } from "@/components/facility/MaintenanceLogDetailSheet";

const KANBAN_COLS: MaintenanceLogStatus[] = ["reported", "assigned", "in_progress", "pending_parts", "completed", "verified"];

export default function FacilityMaintenance() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").order("name");
      return data ?? [];
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["facility-maint-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("maintenance_logs")
        .select("*, parking_lots(code, name), equipment(name, equipment_type)")
        .order("reported_at", { ascending: false });
      return (data ?? []) as unknown as MaintenanceLog[];
    },
  });

  const selectedLog = useMemo(() => logs.find((log) => log.id === selectedLogId) ?? null, [logs, selectedLogId]);

  const [selectedLot, setSelectedLot] = useState("");
  const { data: lotEquipment = [] } = useQuery({
    queryKey: ["lot-equipment", selectedLot],
    queryFn: async () => {
      if (!selectedLot) return [];
      const { data } = await supabase.from("equipment").select("id, name, equipment_type").eq("lot_id", selectedLot);
      return data ?? [];
    },
    enabled: !!selectedLot,
  });

  const [form, setForm] = useState({
    lot_id: "",
    equipment_id: "",
    maintenance_type: "repair",
    priority: "medium",
    title: "",
    symptom: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const logNumber = `MR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`;
      const { error } = await supabase.from("maintenance_logs").insert({
        log_number: logNumber,
        lot_id: form.lot_id,
        equipment_id: form.equipment_id || null,
        maintenance_type: form.maintenance_type,
        priority: form.priority,
        title: form.title,
        symptom: form.symptom || null,
        reported_by: user?.id,
        status: "reported",
        parts_cost: 0,
        labor_cost: 0,
        other_cost: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("유지보수가 접수되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-maint-logs"] });
      setDialogOpen(false);
      setForm({ lot_id: "", equipment_id: "", maintenance_type: "repair", priority: "medium", title: "", symptom: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, string> = { status };
      if (status === "assigned") updates.assigned_at = new Date().toISOString();
      if (status === "in_progress") updates.started_at = new Date().toISOString();
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase.from("maintenance_logs").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-maint-logs"] });
    },
  });

  const filtered = logs.filter((log) => {
    const statusMatch =
      statusFilter === "all" ||
      (statusFilter === "pending" && !["completed", "verified", "cancelled"].includes(log.status)) ||
      (statusFilter === "done" && ["completed", "verified"].includes(log.status));

    if (!statusMatch) return false;
    if (!search) return true;

    const query = search.toLowerCase();
    return log.title.toLowerCase().includes(query) || log.log_number.toLowerCase().includes(query);
  });

  const formatCost = (value: number) => (value > 0 ? `${value.toLocaleString()}원` : "-");

  const openLogDetail = (log: MaintenanceLog) => {
    setSelectedLogId(log.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">유지보수 관리</h1>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === "table" ? "default" : "outline"} size="icon" onClick={() => setViewMode("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "kanban" ? "default" : "outline"} size="icon" onClick={() => setViewMode("kanban")}>
              <Columns3 className="h-4 w-4" />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />유지보수 접수
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>유지보수 접수</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>주차장 *</Label>
                    <Select
                      value={form.lot_id}
                      onValueChange={(value) => {
                        setForm((prev) => ({ ...prev, lot_id: value, equipment_id: "" }));
                        setSelectedLot(value);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{lots.map((lot: { id: string; name: string }) => <SelectItem key={lot.id} value={lot.id}>{lot.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {form.lot_id && (
                    <div>
                      <Label>장비 (선택사항)</Label>
                      <Select value={form.equipment_id} onValueChange={(value) => setForm((prev) => ({ ...prev, equipment_id: value }))}>
                        <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>{lotEquipment.map((item: { id: string; name: string }) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>유형</Label>
                    <Select value={form.maintenance_type} onValueChange={(value) => setForm((prev) => ({ ...prev, maintenance_type: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(MAINT_TYPE_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>우선순위</Label>
                    <Select value={form.priority} onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(PRIORITY_LABELS).map(([key, value]) => <SelectItem key={key} value={key}>{value}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>제목 *</Label><Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} /></div>
                  <div><Label>증상/설명</Label><Textarea value={form.symptom} onChange={(event) => setForm((prev) => ({ ...prev, symptom: event.target.value }))} rows={3} /></div>
                  <Button className="w-full" disabled={!form.lot_id || !form.title || createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? "접수 중..." : "접수"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList><TabsTrigger value="all">전체</TabsTrigger><TabsTrigger value="pending">미완료</TabsTrigger><TabsTrigger value="done">완료</TabsTrigger></TabsList>
          </Tabs>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="제목, 접수번호 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        {viewMode === "table" ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead><TableHead>우선순위</TableHead><TableHead>제목</TableHead>
                    <TableHead>주차장</TableHead><TableHead>장비</TableHead><TableHead>유형</TableHead>
                    <TableHead>신고일</TableHead><TableHead>상태</TableHead><TableHead className="text-right">비용</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openLogDetail(log)}>
                      <TableCell className="font-mono text-xs">{log.log_number}</TableCell>
                      <TableCell><Badge className={PRIORITY_COLORS[log.priority]}>{PRIORITY_LABELS[log.priority]}</Badge></TableCell>
                      <TableCell className="font-medium">{log.title}</TableCell>
                      <TableCell>{log.parking_lots?.name || "-"}</TableCell>
                      <TableCell>{log.equipment?.name || "-"}</TableCell>
                      <TableCell>{MAINT_TYPE_LABELS[log.maintenance_type] || log.maintenance_type}</TableCell>
                      <TableCell className="text-sm">{log.reported_at ? new Date(log.reported_at).toLocaleDateString() : "-"}</TableCell>
                      <TableCell><Badge variant="outline">{MAINT_STATUS_LABELS[log.status]}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{formatCost(log.total_cost)}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "유지보수 기록이 없습니다"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-6 gap-3 overflow-x-auto">
            {KANBAN_COLS.map((column) => (
              <div key={column} className="min-w-[180px]">
                <div className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                  {MAINT_STATUS_LABELS[column]}
                  <Badge variant="secondary" className="ml-auto text-xs">{logs.filter((log) => log.status === column).length}</Badge>
                </div>
                <div className="space-y-2">
                  {logs.filter((log) => log.status === column).map((log) => (
                    <Card key={log.id} className="cursor-pointer" onClick={() => openLogDetail(log)}>
                      <CardContent className="p-3">
                        <p className="mb-1 line-clamp-2 text-sm font-medium">{log.title}</p>
                        <p className="text-xs text-muted-foreground">{log.parking_lots?.name}</p>
                        {log.equipment?.name && <p className="text-xs text-muted-foreground">{log.equipment.name}</p>}
                        {column !== "verified" && column !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 w-full text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              const next: Record<string, string> = { reported: "assigned", assigned: "in_progress", in_progress: "completed", pending_parts: "in_progress", completed: "verified" };
                              if (next[column]) updateStatusMutation.mutate({ id: log.id, status: next[column] });
                            }}
                          >
                            {column === "reported" ? "배정" : column === "assigned" ? "작업 시작" : column === "in_progress" ? "완료 처리" : column === "pending_parts" ? "재개" : "검증 완료"}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MaintenanceLogDetailSheet log={selectedLog} open={detailOpen} onOpenChange={setDetailOpen} />
    </DashboardLayout>
  );
}
