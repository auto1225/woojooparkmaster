import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { SurveyBasicInfo } from "@/types/survey";
import { Save } from "lucide-react";

interface Props {
  data: SurveyBasicInfo | null | undefined;
  onSave: (data: Partial<SurveyBasicInfo>) => void;
  readOnly?: boolean;
}

export function StepBasicInfo({ data, onSave, readOnly }: Props) {
  const [form, setForm] = useState<Partial<SurveyBasicInfo>>({});

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

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

      {/* 주차장 유형 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">주차장 유형</Label>
        <RadioGroup value={form.lot_type || ""} onValueChange={v => set("lot_type", v)} className="flex flex-wrap gap-4" disabled={readOnly}>
          {[
            { value: "offstreet", label: "노외" },
            { value: "onstreet", label: "노상" },
            { value: "multilevel", label: "복층화" },
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
          <Button onClick={() => {
            const { id: _id, survey_id, ...rest } = form as any;
            onSave(rest);
          }}>
            <Save className="h-4 w-4 mr-1" /> 저장
          </Button>
        </div>
      )}
    </div>
  );
}
