import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { toast } from "sonner";
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS } from "@/types/facility";
import type { Equipment } from "@/types/facility";
import { EquipmentDetailSheet } from "@/components/facility/EquipmentDetailSheet";

export default function FacilityEquipment() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);

  const { data: lots = [] } = useQuery({
    queryKey: ["parking-lots-select"],
    queryFn: async () => {
      const { data } = await supabase.from("parking_lots").select("id, code, name").order("name");
      return data ?? [];
    },
  });

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["facility-equipment"],
    queryFn: async () => {
      const { data } = await supabase.from("equipment").select("*, parking_lots(code, name)").order("equipment_code");
      return (data ?? []) as unknown as Equipment[];
    },
  });

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === selectedEquipmentId) ?? null,
    [equipment, selectedEquipmentId],
  );

  const filtered = equipment.filter((item) => {
    if (filterType !== "all" && item.equipment_type !== filterType) return false;
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (!search) return true;

    const query = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.equipment_code.toLowerCase().includes(query) ||
      (item.serial_number || "").toLowerCase().includes(query)
    );
  });

  const [form, setForm] = useState({
    equipment_type: "",
    name: "",
    lot_id: "",
    location_detail: "",
    floor: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    install_date: "",
    warranty_end: "",
    purchase_cost: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const typeAbbr = form.equipment_type.substring(0, 3).toUpperCase();
      const count = equipment.filter((item) => item.equipment_type === form.equipment_type).length + 1;
      const code = `EQ-${typeAbbr}-${String(count).padStart(3, "0")}`;

      const { error } = await supabase.from("equipment").insert({
        equipment_code: code,
        equipment_type: form.equipment_type,
        name: form.name,
        lot_id: form.lot_id,
        location_detail: form.location_detail || null,
        floor: form.floor ? parseInt(form.floor, 10) : null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        install_date: form.install_date || null,
        warranty_end: form.warranty_end || null,
        purchase_cost: form.purchase_cost ? parseInt(form.purchase_cost, 10) : null,
        notes: form.notes || null,
        quantity: 1,
        author_name: (form as any).author_name || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("장비가 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-equipment"] });
      setDialogOpen(false);
      setForm({
        equipment_type: "",
        name: "",
        lot_id: "",
        location_detail: "",
        floor: "",
        manufacturer: "",
        model: "",
        serial_number: "",
        install_date: "",
        warranty_end: "",
        purchase_cost: "",
        notes: "",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const formatCost = (value?: number | null) => (value != null ? `${value.toLocaleString()}원` : "-");

  const openEquipmentDetail = (equipmentItem: Equipment) => {
    setSelectedEquipmentId(equipmentItem.id);
    setDetailOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">장비 관리</h1>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === "table" ? "default" : "outline"} size="icon" onClick={() => setViewMode("table")}> 
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "card" ? "default" : "outline"} size="icon" onClick={() => setViewMode("card")}> 
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" />장비 등록
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>장비 등록</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>장비 유형 *</Label>
                    <Select value={form.equipment_type} onValueChange={(value) => setForm((prev) => ({ ...prev, equipment_type: value }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(EQUIPMENT_TYPE_LABELS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>{value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>장비명 *</Label><Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></div>
                  <div>
                    <Label>주차장 *</Label>
                    <Select value={form.lot_id} onValueChange={(value) => setForm((prev) => ({ ...prev, lot_id: value }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {lots.map((lot: { id: string; name: string; code: string }) => (
                          <SelectItem key={lot.id} value={lot.id}>{lot.name} ({lot.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>위치 상세</Label><Input value={form.location_detail} onChange={(event) => setForm((prev) => ({ ...prev, location_detail: event.target.value }))} placeholder="예: B1층 입구 좌측" /></div>
                    <div><Label>층</Label><Input type="number" value={form.floor} onChange={(event) => setForm((prev) => ({ ...prev, floor: event.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>제조사</Label><Input value={form.manufacturer} onChange={(event) => setForm((prev) => ({ ...prev, manufacturer: event.target.value }))} /></div>
                    <div><Label>모델명</Label><Input value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} /></div>
                  </div>
                  <div><Label>시리얼번호</Label><Input value={form.serial_number} onChange={(event) => setForm((prev) => ({ ...prev, serial_number: event.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>설치일</Label><Input type="date" value={form.install_date} onChange={(event) => setForm((prev) => ({ ...prev, install_date: event.target.value }))} /></div>
                    <div><Label>보증만료</Label><Input type="date" value={form.warranty_end} onChange={(event) => setForm((prev) => ({ ...prev, warranty_end: event.target.value }))} /></div>
                  </div>
                  <div><Label>취득원가 (원)</Label><Input type="number" value={form.purchase_cost} onChange={(event) => setForm((prev) => ({ ...prev, purchase_cost: event.target.value }))} /></div>
                  <div><Label>비고</Label><Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={2} /></div>
                  <AuthorField value={(form as any).author_name || ""} onChange={v => setForm(prev => ({ ...prev, author_name: v } as any))} />
                  <Button className="w-full" disabled={!form.equipment_type || !form.name || !form.lot_id || createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? "등록 중..." : "등록"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="장비명, 코드, 시리얼 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {Object.entries(EQUIPMENT_TYPE_LABELS).map(([key, value]) => (
                <SelectItem key={key} value={key}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([key, value]) => (
                <SelectItem key={key} value={key}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {viewMode === "table" ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead><TableHead>장비명</TableHead><TableHead>유형</TableHead>
                    <TableHead>주차장</TableHead><TableHead>제조사/모델</TableHead><TableHead>설치일</TableHead>
                    <TableHead>보증만료</TableHead><TableHead>상태</TableHead><TableHead className="text-right">누적수리비</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEquipmentDetail(item)}>
                      <TableCell className="font-mono text-xs">{item.equipment_code}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell><Badge variant="outline">{EQUIPMENT_TYPE_LABELS[item.equipment_type] || item.equipment_type}</Badge></TableCell>
                      <TableCell>{item.parking_lots?.name || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{[item.manufacturer, item.model].filter(Boolean).join(" / ") || "-"}</TableCell>
                      <TableCell className="text-sm">{item.install_date || "-"}</TableCell>
                      <TableCell className="text-sm">{item.warranty_end || "-"}</TableCell>
                      <TableCell><Badge className={EQUIPMENT_STATUS_COLORS[item.status]}>{EQUIPMENT_STATUS_LABELS[item.status]}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{formatCost(item.total_maintenance_cost)}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{isLoading ? "로딩 중..." : "등록된 장비가 없습니다"}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {filtered.map((item) => (
              <Card key={item.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => openEquipmentDetail(item)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <p className="text-xs text-muted-foreground font-mono">{item.equipment_code}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{EQUIPMENT_TYPE_LABELS[item.equipment_type] || item.equipment_type}</Badge>
                    <Badge className={EQUIPMENT_STATUS_COLORS[item.status]}>{EQUIPMENT_STATUS_LABELS[item.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.parking_lots?.name || "-"}</p>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && <p className="col-span-3 py-8 text-center text-muted-foreground">등록된 장비가 없습니다</p>}
          </div>
        )}
      </div>

      <EquipmentDetailSheet equipment={selectedEquipment} open={detailOpen} onOpenChange={setDetailOpen} />
    </DashboardLayout>
  );
}
