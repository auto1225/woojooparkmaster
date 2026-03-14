import { useState } from "react";
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
import { toast } from "sonner";
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_COLORS } from "@/types/facility";
import type { Equipment } from "@/types/facility";

export default function FacilityEquipment() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const filtered = equipment.filter(e => {
    if (filterType !== 'all' && e.equipment_type !== filterType) return false;
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return e.name.toLowerCase().includes(s) || e.equipment_code.toLowerCase().includes(s) || (e.serial_number || '').toLowerCase().includes(s);
    }
    return true;
  });

  // New equipment form
  const [form, setForm] = useState({
    equipment_type: '', name: '', lot_id: '', location_detail: '', floor: '',
    manufacturer: '', model: '', serial_number: '', install_date: '', warranty_end: '',
    purchase_cost: '', notes: '',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Generate code
      const typeAbbr = form.equipment_type.substring(0, 3).toUpperCase();
      const count = equipment.filter(e => e.equipment_type === form.equipment_type).length + 1;
      const code = `EQ-${typeAbbr}-${String(count).padStart(3, '0')}`;

      const { error } = await supabase.from("equipment").insert({
        equipment_code: code,
        equipment_type: form.equipment_type,
        name: form.name,
        lot_id: form.lot_id,
        location_detail: form.location_detail || null,
        floor: form.floor ? parseInt(form.floor) : null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        install_date: form.install_date || null,
        warranty_end: form.warranty_end || null,
        purchase_cost: form.purchase_cost ? parseInt(form.purchase_cost) : null,
        notes: form.notes || null,
        quantity: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("장비가 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["facility-equipment"] });
      setDialogOpen(false);
      setForm({ equipment_type: '', name: '', lot_id: '', location_detail: '', floor: '', manufacturer: '', model: '', serial_number: '', install_date: '', warranty_end: '', purchase_cost: '', notes: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatCost = (v?: number | null) => v != null ? `${v.toLocaleString()}원` : '-';

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">장비 관리</h1>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'table' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('table')}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === 'card' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('card')}><LayoutGrid className="h-4 w-4" /></Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />장비 등록</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>장비 등록</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>장비 유형 *</Label>
                    <Select value={form.equipment_type} onValueChange={v => setForm(p => ({ ...p, equipment_type: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{Object.entries(EQUIPMENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>장비명 *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div>
                    <Label>주차장 *</Label>
                    <Select value={form.lot_id} onValueChange={v => setForm(p => ({ ...p, lot_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>{lots.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>위치 상세</Label><Input value={form.location_detail} onChange={e => setForm(p => ({ ...p, location_detail: e.target.value }))} placeholder="예: B1층 입구 좌측" /></div>
                    <div><Label>층</Label><Input type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>제조사</Label><Input value={form.manufacturer} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))} /></div>
                    <div><Label>모델명</Label><Input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} /></div>
                  </div>
                  <div><Label>시리얼번호</Label><Input value={form.serial_number} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>설치일</Label><Input type="date" value={form.install_date} onChange={e => setForm(p => ({ ...p, install_date: e.target.value }))} /></div>
                    <div><Label>보증만료</Label><Input type="date" value={form.warranty_end} onChange={e => setForm(p => ({ ...p, warranty_end: e.target.value }))} /></div>
                  </div>
                  <div><Label>취득원가 (원)</Label><Input type="number" value={form.purchase_cost} onChange={e => setForm(p => ({ ...p, purchase_cost: e.target.value }))} /></div>
                  <div><Label>비고</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
                  <Button className="w-full" disabled={!form.equipment_type || !form.name || !form.lot_id || createMutation.isPending} onClick={() => createMutation.mutate()}>
                    {createMutation.isPending ? '등록 중...' : '등록'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="장비명, 코드, 시리얼 검색" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {Object.entries(EQUIPMENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {viewMode === 'table' ? (
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
                  {filtered.map(eq => (
                    <TableRow key={eq.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">{eq.equipment_code}</TableCell>
                      <TableCell className="font-medium">{eq.name}</TableCell>
                      <TableCell><Badge variant="outline">{EQUIPMENT_TYPE_LABELS[eq.equipment_type] || eq.equipment_type}</Badge></TableCell>
                      <TableCell>{eq.parking_lots?.name || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{[eq.manufacturer, eq.model].filter(Boolean).join(' / ') || '-'}</TableCell>
                      <TableCell className="text-sm">{eq.install_date || '-'}</TableCell>
                      <TableCell className="text-sm">{eq.warranty_end || '-'}</TableCell>
                      <TableCell><Badge className={EQUIPMENT_STATUS_COLORS[eq.status]}>{EQUIPMENT_STATUS_LABELS[eq.status]}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{formatCost(eq.total_maintenance_cost)}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{isLoading ? '로딩 중...' : '등록된 장비가 없습니다'}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {filtered.map(eq => (
              <Card key={eq.id} className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${eq.status === 'normal' ? 'border-l-green-500' : eq.status === 'warning' ? 'border-l-yellow-500' : eq.status === 'broken' ? 'border-l-red-500' : 'border-l-blue-500'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{eq.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{eq.equipment_code}</p>
                    </div>
                    <Badge className={EQUIPMENT_STATUS_COLORS[eq.status]}>{EQUIPMENT_STATUS_LABELS[eq.status]}</Badge>
                  </div>
                  <Badge variant="outline" className="mb-2">{EQUIPMENT_TYPE_LABELS[eq.equipment_type] || eq.equipment_type}</Badge>
                  <p className="text-sm text-muted-foreground">{eq.parking_lots?.name}</p>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground text-center col-span-3 py-8">등록된 장비가 없습니다</p>}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
