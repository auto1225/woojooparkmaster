import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { Plus, LayoutGrid, List, MapPin } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import {
  SITE_STATUS_LABELS, SITE_STATUS_COLORS, OWNERSHIP_LABELS,
  getSiteGrade, getSiteGradeColor, formatBudgetWon, SHAPE_LABELS, ACQUISITION_LABELS,
} from "@/types/planning";
import { LOT_TYPE_LABELS } from "@/types/database";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

export default function PlanningSites() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"table" | "card">("table");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownershipFilter, setOwnershipFilter] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [showEvaluate, setShowEvaluate] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const { data: sites, isLoading } = useQuery({
    queryKey: ["planning-sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_candidates")
        .select("*")
        .order("total_score", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (sites || []).filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (ownershipFilter !== "all" && s.ownership !== ownershipFilter) return false;
    return true;
  });

  // New site form state
  const [form, setForm] = useState<Record<string, any>>({});
  const updateForm = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.name) { toast({ title: "부지명을 입력해주세요", variant: "destructive" }); return; }
    const year = new Date().getFullYear();
    const count = (sites || []).length + 1;
    const siteNumber = `SC-${year}-${String(count).padStart(3, '0')}`;

    const { error } = await supabase.from("site_candidates").insert([{
      site_number: siteNumber,
      name: form.name,
      address_jibun: form.address_jibun || null,
      address_road: form.address_road || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      administrative_dong: form.administrative_dong || null,
      area_sqm: form.area_sqm ? Number(form.area_sqm) : null,
      shape: form.shape || null,
      frontage_m: form.frontage_m ? Number(form.frontage_m) : null,
      depth_m: form.depth_m ? Number(form.depth_m) : null,
      slope_pct: form.slope_pct ? Number(form.slope_pct) : null,
      ground_condition: form.ground_condition || null,
      zoning: form.zoning || null,
      land_use: form.land_use || null,
      land_category: form.land_category || null,
      ownership: form.ownership || null,
      owner_name: form.owner_name || null,
      acquisition_method: form.acquisition_method || null,
      estimated_land_cost: form.estimated_land_cost ? Number(form.estimated_land_cost) : null,
      planned_lot_type: form.planned_lot_type || null,
      estimated_spaces: form.estimated_spaces ? Number(form.estimated_spaces) : null,
      estimated_floors: form.estimated_floors ? Number(form.estimated_floors) : 1,
      building_coverage_ratio: form.building_coverage_ratio ? Number(form.building_coverage_ratio) : null,
      floor_area_ratio: form.floor_area_ratio ? Number(form.floor_area_ratio) : null,
      height_limit_m: form.height_limit_m ? Number(form.height_limit_m) : null,
      setback_m: form.setback_m ? Number(form.setback_m) : null,
      nearest_road: form.nearest_road || null,
      road_width_m: form.road_width_m ? Number(form.road_width_m) : null,
      traffic_volume: form.traffic_volume || null,
      public_transport_access: form.public_transport_access || null,
      pedestrian_access: form.pedestrian_access || null,
      nearby_facilities: form.nearby_facilities || null,
      surrounding_population: form.surrounding_population ? Number(form.surrounding_population) : null,
      surrounding_commercial_area: form.surrounding_commercial_area ? Number(form.surrounding_commercial_area) : null,
      legal_restrictions: form.legal_restrictions || null,
      environmental_review: form.environmental_review || false,
      traffic_impact_review: form.traffic_impact_review || false,
      cultural_heritage_review: form.cultural_heritage_review || false,
      created_by: profile?.id,
    }] as any);
    if (error) { toast({ title: "등록 실패", description: error.message, variant: "destructive" }); return; }
    toast({ title: "후보부지 등록 완료" });
    logActivity({ module: "PLANNING", action: "site_created", targetType: "site_candidate", targetName: form.name });
    setShowNew(false);
    setForm({});
    setStep(1);
    queryClient.invalidateQueries({ queryKey: ["planning-sites"] });
  };

  // Evaluate form
  const [evalForm, setEvalForm] = useState<Record<string, any>>({});
  const updateEval = (k: string, v: any) => setEvalForm(prev => ({ ...prev, [k]: v }));
  const evalSite = (sites || []).find(s => s.id === showEvaluate);

  const openEvaluate = (site: any) => {
    setShowEvaluate(site.id);
    setEvalForm({
      location_score: Number(site.location_score) || 0,
      accessibility_score: Number(site.accessibility_score) || 0,
      demand_score: Number(site.demand_score) || 0,
      feasibility_score: Number(site.feasibility_score) || 0,
      legal_score: Number(site.legal_score) || 0,
      estimated_construction_cost: site.estimated_construction_cost || '',
      estimated_annual_revenue: site.estimated_annual_revenue || '',
      estimated_annual_expense: site.estimated_annual_expense || '',
    });
  };

  const handleEvaluate = async () => {
    if (!showEvaluate) return;
    const revenue = Number(evalForm.estimated_annual_revenue) || 0;
    const expense = Number(evalForm.estimated_annual_expense) || 0;
    const profit = revenue - expense;
    const constructionCost = Number(evalForm.estimated_construction_cost) || 0;
    const bcRatio = expense > 0 ? Number((revenue / expense).toFixed(2)) : 0;
    const payback = profit > 0 ? Number((constructionCost / profit).toFixed(1)) : 0;

    const { error } = await supabase.from("site_candidates").update({
      location_score: evalForm.location_score,
      accessibility_score: evalForm.accessibility_score,
      demand_score: evalForm.demand_score,
      feasibility_score: evalForm.feasibility_score,
      legal_score: evalForm.legal_score,
      estimated_construction_cost: constructionCost || null,
      estimated_annual_revenue: revenue || null,
      estimated_annual_expense: expense || null,
      estimated_annual_profit: profit || null,
      bc_ratio: bcRatio || null,
      payback_years: payback || null,
      status: "evaluating",
      evaluation_date: new Date().toISOString().split("T")[0],
      evaluator_id: profile?.id,
    } as any).eq("id", showEvaluate);
    if (error) { toast({ title: "평가 저장 실패", description: error.message, variant: "destructive" }); return; }
    toast({ title: "평가 완료" });
    logActivity({ module: "PLANNING", action: "site_evaluated", targetType: "site_candidate", targetId: showEvaluate });
    setShowEvaluate(null);
    queryClient.invalidateQueries({ queryKey: ["planning-sites"] });
  };

  const evalTotal = (evalForm.location_score || 0) + (evalForm.accessibility_score || 0) + (evalForm.demand_score || 0) + (evalForm.feasibility_score || 0) + (evalForm.legal_score || 0);
  const radarData = [
    { subject: "입지", value: evalForm.location_score || 0, max: 20 },
    { subject: "접근성", value: evalForm.accessibility_score || 0, max: 20 },
    { subject: "수요", value: evalForm.demand_score || 0, max: 20 },
    { subject: "사업성", value: evalForm.feasibility_score || 0, max: 20 },
    { subject: "법적", value: evalForm.legal_score || 0, max: 20 },
  ];

  const canEdit = profile?.role && ["admin", "manager", "editor"].includes(profile.role);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">후보부지 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">부지 평가 및 선정</p>
          </div>
          {canEdit && <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />후보부지 등록</Button>}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              {Object.entries(SITE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ownershipFilter} onValueChange={setOwnershipFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="소유구분" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 소유구분</SelectItem>
              {Object.entries(OWNERSHIP_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-1">
            <Button variant={view === "table" ? "default" : "outline"} size="icon" onClick={() => setView("table")}><List className="h-4 w-4" /></Button>
            <Button variant={view === "card" ? "default" : "outline"} size="icon" onClick={() => setView("card")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Table View */}
        {view === "table" && (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>번호</TableHead>
                      <TableHead>부지명</TableHead>
                      <TableHead>주소</TableHead>
                      <TableHead className="text-right">면적(㎡)</TableHead>
                      <TableHead>소유구분</TableHead>
                      <TableHead className="text-right">예상면수</TableHead>
                      <TableHead className="text-right">총점</TableHead>
                      <TableHead>등급</TableHead>
                      <TableHead className="text-right">B/C</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs font-mono">{s.site_number}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{s.address_jibun || '-'}</TableCell>
                        <TableCell className="text-right text-xs">{s.area_sqm ? Number(s.area_sqm).toLocaleString() : '-'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{OWNERSHIP_LABELS[s.ownership || ''] || s.ownership || '-'}</Badge></TableCell>
                        <TableCell className="text-right">{s.estimated_spaces || '-'}</TableCell>
                        <TableCell className="text-right font-bold">{s.total_score ? Number(s.total_score).toFixed(0) : '-'}</TableCell>
                        <TableCell><Badge className={getSiteGradeColor(Number(s.total_score))} variant="outline">{getSiteGrade(Number(s.total_score))}</Badge></TableCell>
                        <TableCell className="text-right text-xs">{s.bc_ratio ? Number(s.bc_ratio).toFixed(2) : '-'}</TableCell>
                        <TableCell><Badge className={SITE_STATUS_COLORS[s.status] || ''} variant="outline">{SITE_STATUS_LABELS[s.status] || s.status}</Badge></TableCell>
                        <TableCell>
                          {canEdit && <Button size="sm" variant="outline" onClick={() => openEvaluate(s)}>평가</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">데이터가 없습니다</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card View */}
        {view === "card" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => {
              const rd = [
                { subject: "입지", value: Number(s.location_score) || 0 },
                { subject: "접근성", value: Number(s.accessibility_score) || 0 },
                { subject: "수요", value: Number(s.demand_score) || 0 },
                { subject: "사업성", value: Number(s.feasibility_score) || 0 },
                { subject: "법적", value: Number(s.legal_score) || 0 },
              ];
              return (
                <Card key={s.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => canEdit && openEvaluate(s)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.address_jibun || s.site_number}</p>
                      </div>
                      <Badge className={SITE_STATUS_COLORS[s.status] || ''} variant="outline">{SITE_STATUS_LABELS[s.status] || s.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>면적: {s.area_sqm ? `${Number(s.area_sqm).toLocaleString()}㎡` : '-'}</span>
                      <span>면수: {s.estimated_spaces || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{s.total_score ? Number(s.total_score).toFixed(0) : '-'}</p>
                        <Badge className={getSiteGradeColor(Number(s.total_score))} variant="outline">{getSiteGrade(Number(s.total_score))}</Badge>
                      </div>
                      <div className="w-[120px] h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={rd}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                            <PolarRadiusAxis domain={[0, 20]} tick={false} axisLine={false} />
                            <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* New Site Dialog */}
      <Dialog open={showNew} onOpenChange={(v) => { setShowNew(v); if (!v) { setForm({}); setStep(1); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>후보부지 등록 (Step {step}/5)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-1 mb-4">
            {[1,2,3,4,5].map(s => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>부지명 *</Label><Input value={form.name || ''} onChange={e => updateForm('name', e.target.value)} placeholder="예: 중앙동 공한지" /></div>
              <div><Label>지번주소</Label><Input value={form.address_jibun || ''} onChange={e => updateForm('address_jibun', e.target.value)} /></div>
              <div><Label>도로명주소</Label><Input value={form.address_road || ''} onChange={e => updateForm('address_road', e.target.value)} /></div>
              <div><Label>위도</Label><Input type="number" step="any" value={form.latitude || ''} onChange={e => updateForm('latitude', e.target.value)} /></div>
              <div><Label>경도</Label><Input type="number" step="any" value={form.longitude || ''} onChange={e => updateForm('longitude', e.target.value)} /></div>
              <div><Label>행정동</Label><Input value={form.administrative_dong || ''} onChange={e => updateForm('administrative_dong', e.target.value)} /></div>
              <div><Label>면적 (㎡)</Label><Input type="number" value={form.area_sqm || ''} onChange={e => updateForm('area_sqm', e.target.value)} /></div>
              <div><Label>형상</Label>
                <Select value={form.shape || ''} onValueChange={v => updateForm('shape', v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{Object.entries(SHAPE_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>전면도로 폭(m)</Label><Input type="number" value={form.frontage_m || ''} onChange={e => updateForm('frontage_m', e.target.value)} /></div>
              <div><Label>경사도(%)</Label><Input type="number" value={form.slope_pct || ''} onChange={e => updateForm('slope_pct', e.target.value)} /></div>
              <div><Label>지반 상태</Label><Input value={form.ground_condition || ''} onChange={e => updateForm('ground_condition', e.target.value)} /></div>
            </div>
          )}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>용도지역</Label><Input value={form.zoning || ''} onChange={e => updateForm('zoning', e.target.value)} placeholder="일반상업/준주거 등" /></div>
              <div><Label>토지 용도</Label><Input value={form.land_use || ''} onChange={e => updateForm('land_use', e.target.value)} /></div>
              <div><Label>지목</Label><Input value={form.land_category || ''} onChange={e => updateForm('land_category', e.target.value)} /></div>
              <div><Label>소유구분</Label>
                <Select value={form.ownership || ''} onValueChange={v => updateForm('ownership', v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{Object.entries(OWNERSHIP_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.ownership === 'private' && <div><Label>소유자</Label><Input value={form.owner_name || ''} onChange={e => updateForm('owner_name', e.target.value)} /></div>}
              <div><Label>취득방법</Label>
                <Select value={form.acquisition_method || ''} onValueChange={v => updateForm('acquisition_method', v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{Object.entries(ACQUISITION_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>예상 토지비용 (원)</Label><Input type="number" value={form.estimated_land_cost || ''} onChange={e => updateForm('estimated_land_cost', e.target.value)} /></div>
            </div>
          )}
          {step === 3 && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>계획 유형</Label>
                <Select value={form.planned_lot_type || ''} onValueChange={v => updateForm('planned_lot_type', v)}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{Object.entries(LOT_TYPE_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>예상 주차면수</Label><Input type="number" value={form.estimated_spaces || ''} onChange={e => updateForm('estimated_spaces', e.target.value)} /></div>
              <div><Label>예상 층수</Label><Input type="number" value={form.estimated_floors || ''} onChange={e => updateForm('estimated_floors', e.target.value)} /></div>
              <div><Label>건폐율(%)</Label><Input type="number" value={form.building_coverage_ratio || ''} onChange={e => updateForm('building_coverage_ratio', e.target.value)} /></div>
              <div><Label>용적률(%)</Label><Input type="number" value={form.floor_area_ratio || ''} onChange={e => updateForm('floor_area_ratio', e.target.value)} /></div>
              <div><Label>높이제한(m)</Label><Input type="number" value={form.height_limit_m || ''} onChange={e => updateForm('height_limit_m', e.target.value)} /></div>
              <div><Label>이격거리(m)</Label><Input type="number" value={form.setback_m || ''} onChange={e => updateForm('setback_m', e.target.value)} /></div>
            </div>
          )}
          {step === 4 && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>접근도로명</Label><Input value={form.nearest_road || ''} onChange={e => updateForm('nearest_road', e.target.value)} /></div>
              <div><Label>도로폭(m)</Label><Input type="number" value={form.road_width_m || ''} onChange={e => updateForm('road_width_m', e.target.value)} /></div>
              <div><Label>교통량</Label><Input value={form.traffic_volume || ''} onChange={e => updateForm('traffic_volume', e.target.value)} /></div>
              <div className="col-span-2"><Label>대중교통 접근성</Label><Textarea value={form.public_transport_access || ''} onChange={e => updateForm('public_transport_access', e.target.value)} /></div>
              <div className="col-span-2"><Label>보행 접근성</Label><Textarea value={form.pedestrian_access || ''} onChange={e => updateForm('pedestrian_access', e.target.value)} /></div>
              <div className="col-span-2"><Label>주변 시설</Label><Textarea value={form.nearby_facilities || ''} onChange={e => updateForm('nearby_facilities', e.target.value)} /></div>
              <div><Label>주변 인구수</Label><Input type="number" value={form.surrounding_population || ''} onChange={e => updateForm('surrounding_population', e.target.value)} /></div>
              <div><Label>주변 상업면적(㎡)</Label><Input type="number" value={form.surrounding_commercial_area || ''} onChange={e => updateForm('surrounding_commercial_area', e.target.value)} /></div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              <div><Label>법적 제한사항</Label><Textarea value={form.legal_restrictions || ''} onChange={e => updateForm('legal_restrictions', e.target.value)} /></div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2"><Switch checked={form.environmental_review || false} onCheckedChange={v => updateForm('environmental_review', v)} /><Label>환경영향평가 필요</Label></div>
                <div className="flex items-center gap-2"><Switch checked={form.traffic_impact_review || false} onCheckedChange={v => updateForm('traffic_impact_review', v)} /><Label>교통영향평가 필요</Label></div>
                <div className="flex items-center gap-2"><Switch checked={form.cultural_heritage_review || false} onCheckedChange={v => updateForm('cultural_heritage_review', v)} /><Label>문화재조사 필요</Label></div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between mt-4">
            <div>{step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>이전</Button>}</div>
            <div className="flex gap-2">
              {step < 5 && <Button onClick={() => setStep(s => s + 1)}>다음</Button>}
              {step === 5 && <Button onClick={handleSave}>등록</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evaluate Dialog */}
      <Dialog open={!!showEvaluate} onOpenChange={(v) => { if (!v) setShowEvaluate(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>부지 평가: {evalSite?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              {[
                { key: 'location_score', label: '입지 적합성' },
                { key: 'accessibility_score', label: '접근성' },
                { key: 'demand_score', label: '주차 수요' },
                { key: 'feasibility_score', label: '사업 타당성' },
                { key: 'legal_score', label: '법적 타당성' },
              ].map(item => (
                <div key={item.key} className="space-y-1">
                  <div className="flex justify-between text-sm"><span>{item.label}</span><span className="font-bold">{evalForm[item.key] || 0}/20</span></div>
                  <Slider value={[evalForm[item.key] || 0]} onValueChange={([v]) => updateEval(item.key, v)} min={0} max={20} step={1} />
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-medium">총점</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{evalTotal}</span>
                  <Badge className={getSiteGradeColor(evalTotal)} variant="outline">{getSiteGrade(evalTotal)}</Badge>
                </div>
              </div>
            </div>
            <div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 20]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-4">
                <p className="text-sm font-medium">사업성 분석</p>
                <div><Label className="text-xs">예상 건설비 (원)</Label><Input type="number" value={evalForm.estimated_construction_cost || ''} onChange={e => updateEval('estimated_construction_cost', e.target.value)} /></div>
                <div><Label className="text-xs">예상 연간 수입 (원)</Label><Input type="number" value={evalForm.estimated_annual_revenue || ''} onChange={e => updateEval('estimated_annual_revenue', e.target.value)} /></div>
                <div><Label className="text-xs">예상 연간 비용 (원)</Label><Input type="number" value={evalForm.estimated_annual_expense || ''} onChange={e => updateEval('estimated_annual_expense', e.target.value)} /></div>
                {evalForm.estimated_annual_revenue && evalForm.estimated_annual_expense && (
                  <div className="text-xs space-y-1 bg-muted/50 p-2 rounded">
                    <p>연간 순이익: {formatBudgetWon(Number(evalForm.estimated_annual_revenue) - Number(evalForm.estimated_annual_expense))}</p>
                    {Number(evalForm.estimated_annual_expense) > 0 && <p>B/C: {(Number(evalForm.estimated_annual_revenue) / Number(evalForm.estimated_annual_expense)).toFixed(2)}</p>}
                    {(Number(evalForm.estimated_annual_revenue) - Number(evalForm.estimated_annual_expense)) > 0 && Number(evalForm.estimated_construction_cost) > 0 && (
                      <p>투자회수: {(Number(evalForm.estimated_construction_cost) / (Number(evalForm.estimated_annual_revenue) - Number(evalForm.estimated_annual_expense))).toFixed(1)}년</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEvaluate(null)}>취소</Button>
            <Button onClick={handleEvaluate}>평가 저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
