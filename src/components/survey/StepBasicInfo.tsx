import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { SurveyBasicInfo } from "@/types/survey";
import { Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  data: SurveyBasicInfo | null | undefined;
  onSave: (data: Partial<SurveyBasicInfo>) => Promise<void> | void;
  onNext?: () => void;
  readOnly?: boolean;
}

export function StepBasicInfo({ data, onSave, onNext, readOnly }: Props) {
  const [form, setForm] = useState<Partial<SurveyBasicInfo>>({});

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const total = Number(form.total_spaces || 0);
    const specialTotal = [form.disabled_spaces, form.ev_spaces, form.compact_spaces, form.pregnant_spaces, form.other_spaces]
      .reduce((sum, value) => sum + Number(value || 0), 0);
    if (!form.lot_name?.trim() || !form.address?.trim() || total <= 0) return "주차장명, 주소, 총 주차면수를 확인해 주세요.";
    if (specialTotal > total) return "특수 주차면수 합계가 총 주차면수를 초과할 수 없습니다.";
    if (form.gps_lat != null && (Number(form.gps_lat) < -90 || Number(form.gps_lat) > 90)) return "GPS 위도는 -90~90 범위여야 합니다.";
    if (form.gps_lng != null && (Number(form.gps_lng) < -180 || Number(form.gps_lng) > 180)) return "GPS 경도는 -180~180 범위여야 합니다.";
    if (form.lot_type === "multilevel" && Number(form.lot_type_floor || 0) <= 0) return "주차빌딩의 층수를 입력해 주세요.";
    if (form.lot_type === "onstreet" && (!form.road_segment?.trim() || !form.road_side?.trim())) return "노상주차장의 도로 구간과 도로 측면을 입력해 주세요.";
    return null;
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold">① 기본현황</h3>

      {/* 기본 정보 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">주차장명</Label>
          <Input value={form.lot_name || ""} onChange={e => set("lot_name", e.target.value)} disabled={readOnly} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">주소</Label>
          <Input value={form.address || ""} onChange={e => set("address", e.target.value)} disabled={readOnly} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">GPS 위도</Label>
          <Input type="number" step="0.0000001" value={form.gps_lat ?? ""} onChange={e => set("gps_lat", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">GPS 경도</Label>
          <Input type="number" step="0.0000001" value={form.gps_lng ?? ""} onChange={e => set("gps_lng", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} />
        </div>
      </div>

      {form.lot_type === "offstreet" && (
        <div className="space-y-3 rounded-md border p-3">
          <Label className="text-xs font-semibold">노외주차장 현장 항목</Label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><Label className="text-[11px]">부지면적(㎡)</Label><Input type="number" min="0" value={form.site_area_sqm ?? ""} onChange={e => set("site_area_sqm", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">배수 상태</Label><Input placeholder="양호/보수필요" value={form.drainage_condition || ""} onChange={e => set("drainage_condition", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">보행 동선 상태</Label><Input placeholder="분리/혼재/개선필요" value={form.pedestrian_route_condition || ""} onChange={e => set("pedestrian_route_condition", e.target.value)} disabled={readOnly} /></div>
          </div>
        </div>
      )}

      {form.lot_type === "onstreet" && (
        <div className="space-y-3 rounded-md border p-3">
          <Label className="text-xs font-semibold">노상주차장 구간 항목</Label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><Label className="text-[11px]">도로 구간*</Label><Input placeholder="시점~종점" value={form.road_segment || ""} onChange={e => set("road_segment", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">도로 측면*</Label><Input placeholder="좌측/우측/양측" value={form.road_side || ""} onChange={e => set("road_side", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">통행 방향</Label><Input placeholder="일방/양방" value={form.traffic_direction || ""} onChange={e => set("traffic_direction", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">면 번호 시작</Label><Input type="number" min="0" value={form.space_start_no ?? ""} onChange={e => set("space_start_no", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">면 번호 종료</Label><Input type="number" min="0" value={form.space_end_no ?? ""} onChange={e => set("space_end_no", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">표지·노면표시 상태</Label><Input placeholder="양호/퇴색/정비필요" value={form.sign_condition || ""} onChange={e => set("sign_condition", e.target.value)} disabled={readOnly} /></div>
          </div>
        </div>
      )}

      {form.lot_type === "multilevel" && (
        <div className="space-y-3 rounded-md border p-3">
          <Label className="text-xs font-semibold">주차빌딩 안전·설비 항목</Label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><Label className="text-[11px]">소방설비 상태</Label><Input placeholder="양호/점검필요" value={form.fire_safety_condition || ""} onChange={e => set("fire_safety_condition", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">환기설비 상태</Label><Input placeholder="양호/점검필요" value={form.ventilation_condition || ""} onChange={e => set("ventilation_condition", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">승강기 상태</Label><Input placeholder="양호/없음/점검필요" value={form.elevator_condition || ""} onChange={e => set("elevator_condition", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">램프 상태</Label><Input placeholder="양호/미끄럼/보수필요" value={form.ramp_condition || ""} onChange={e => set("ramp_condition", e.target.value)} disabled={readOnly} /></div>
            <div><Label className="text-[11px]">높이 제한(m)</Label><Input type="number" min="0" step="0.1" value={form.height_limit_m ?? ""} onChange={e => set("height_limit_m", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} /></div>
          </div>
        </div>
      )}

      {/* 주차장 유형 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">주차장 유형</Label>
        <RadioGroup value={form.lot_type || ""} onValueChange={v => set("lot_type", v)} className="flex flex-wrap gap-4" disabled={readOnly}>
          {[
            { value: "offstreet", label: "노외" },
            { value: "onstreet", label: "노상" },
            { value: "multilevel", label: "주차빌딩" },
            { value: "vacant_lot", label: "공한지" },
            { value: "underground", label: "지하" },
          ].map(o => (
            <div key={o.value} className="flex items-center space-x-2">
              <RadioGroupItem value={o.value} id={`lt-${o.value}`} />
              <Label htmlFor={`lt-${o.value}`} className="text-sm font-normal">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
        {form.lot_type === "multilevel" && (
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs">층수</Label>
            <Input type="number" className="w-20" value={form.lot_type_floor ?? ""} onChange={e => set("lot_type_floor", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} />
            <span className="text-xs text-muted-foreground">층</span>
          </div>
        )}
      </div>

      {/* 운영주체 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">운영주체</Label>
        <RadioGroup value={form.operator_type || ""} onValueChange={v => set("operator_type", v)} className="flex gap-4" disabled={readOnly}>
          {[
            { value: "direct", label: "직영" },
            { value: "outsourced", label: "위탁운영" },
            { value: "other", label: "기타" },
          ].map(o => (
            <div key={o.value} className="flex items-center space-x-2">
              <RadioGroupItem value={o.value} id={`op-${o.value}`} />
              <Label htmlFor={`op-${o.value}`} className="text-sm font-normal">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* 주차면수 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">주차면수</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { key: "total_spaces", label: "총 주차면수", required: true },
            { key: "disabled_spaces", label: "장애인" },
            { key: "ev_spaces", label: "전기차" },
            { key: "compact_spaces", label: "경차" },
            { key: "pregnant_spaces", label: "임산부" },
            { key: "other_spaces", label: "기타" },
          ].map(f => (
            <div key={f.key} className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{f.label}{f.required && <span className="text-destructive">*</span>}</Label>
              <Input type="number" value={(form as any)[f.key] ?? ""} onChange={e => set(f.key, e.target.value ? Number(e.target.value) : null)} disabled={readOnly} />
            </div>
          ))}
        </div>
        {form.other_spaces && form.other_spaces > 0 && (
          <div className="space-y-1 mt-2">
            <Label className="text-[11px] text-muted-foreground">기타 설명</Label>
            <Input value={form.other_spaces_desc || ""} onChange={e => set("other_spaces_desc", e.target.value)} disabled={readOnly} />
          </div>
        )}
      </div>

      {/* 출입구 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">출입구 현황</Label>
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">입구</Label>
            <div className="flex items-center gap-1">
              <Input type="number" className="w-20" value={form.entry_count ?? ""} onChange={e => set("entry_count", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} />
              <span className="text-xs">개</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">출구</Label>
            <div className="flex items-center gap-1">
              <Input type="number" className="w-20" value={form.exit_count ?? ""} onChange={e => set("exit_count", e.target.value ? Number(e.target.value) : null)} disabled={readOnly || !!form.entry_exit_same} />
              <span className="text-xs">개</span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <Checkbox id="entry-exit-same" checked={!!form.entry_exit_same} onCheckedChange={v => set("entry_exit_same", v)} disabled={readOnly} />
            <Label htmlFor="entry-exit-same" className="text-xs font-normal">입출구 동일</Label>
          </div>
        </div>
      </div>

      {/* 바닥 포장재 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">바닥 포장재</Label>
        <RadioGroup value={form.surface_type || ""} onValueChange={v => set("surface_type", v)} className="flex flex-wrap gap-4" disabled={readOnly}>
          {[
            { value: "ascon", label: "아스콘" },
            { value: "block", label: "블럭" },
            { value: "concrete", label: "콘크리트" },
            { value: "other", label: "기타" },
          ].map(o => (
            <div key={o.value} className="flex items-center space-x-2">
              <RadioGroupItem value={o.value} id={`sf-${o.value}`} />
              <Label htmlFor={`sf-${o.value}`} className="text-sm font-normal">{o.label}</Label>
            </div>
          ))}
        </RadioGroup>
        {form.surface_type === "other" && (
          <Input placeholder="기타 포장재" value={form.surface_type_etc || ""} onChange={e => set("surface_type_etc", e.target.value)} disabled={readOnly} className="mt-2 w-60" />
        )}
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={async () => {
            const validationError = validate();
            if (validationError) {
              toast({ title: "입력 내용을 확인해 주세요", description: validationError, variant: "destructive" });
              return;
            }
            const { id: _id, survey_id, ...rest } = form as any;
            await onSave(rest);
            onNext?.();
          }}>
            <Save className="h-4 w-4 mr-1" /> 저장 후 다음
          </Button>
        </div>
      )}
    </div>
  );
}
