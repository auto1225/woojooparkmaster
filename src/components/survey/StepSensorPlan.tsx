import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import type { SurveySensorPlan } from "@/types/survey";
import { Save } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

interface Props {
  data: SurveySensorPlan | null | undefined;
  onSave: (data: Partial<SurveySensorPlan>) => void;
  readOnly?: boolean;
}

export function StepSensorPlan({ data, onSave, readOnly }: Props) {
  const [form, setForm] = useState<Partial<SurveySensorPlan>>({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold">⑤ 센서 설치 및 SW 연계 예상</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">주차면센서</Label>
          <div className="flex items-center gap-2">
            <Input type="number" value={form.planned_sensors ?? ""} onChange={e => set("planned_sensors", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} className="w-24" />
            <span className="text-sm text-muted-foreground">대</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">게이트웨이</Label>
          <div className="flex items-center gap-2">
            <Input type="number" value={form.planned_gateways ?? ""} onChange={e => set("planned_gateways", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} className="w-24" />
            <span className="text-sm text-muted-foreground">대</span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">게이트웨이 설치지점</Label>
        <Textarea value={form.gateway_location || ""} onChange={e => set("gateway_location", e.target.value)} disabled={readOnly} rows={3} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">안내전광판 SW 개발 가능성</Label>
        <RadioGroup value={form.display_sw_feasibility || ""} onValueChange={v => set("display_sw_feasibility", v)} className="flex flex-wrap gap-4" disabled={readOnly}>
          {["개발 가능", "개발 어려움", "개발 불가능"].map(v => (
            <div key={v} className="flex items-center space-x-2"><RadioGroupItem value={v} id={`dsf-${v}`} /><Label htmlFor={`dsf-${v}`} className="text-sm font-normal">{v}</Label></div>
          ))}
        </RadioGroup>
        {(form.display_sw_feasibility === "개발 어려움" || form.display_sw_feasibility === "개발 불가능") && (
          <Input placeholder="사유" value={form.display_sw_note || ""} onChange={e => set("display_sw_note", e.target.value)} disabled={readOnly} className="w-60 mt-1" />
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">주차포털 연계 가능성</Label>
        <RadioGroup value={form.portal_feasibility || ""} onValueChange={v => set("portal_feasibility", v)} className="flex gap-4" disabled={readOnly}>
          <div className="flex items-center space-x-2"><RadioGroupItem value="가능" id="pf-y" /><Label htmlFor="pf-y" className="text-sm font-normal">가능</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="불가능" id="pf-n" /><Label htmlFor="pf-n" className="text-sm font-normal">불가능</Label></div>
        </RadioGroup>
        {form.portal_feasibility === "불가능" && (
          <Input placeholder="사유" value={form.portal_note || ""} onChange={e => set("portal_note", e.target.value)} disabled={readOnly} className="w-60 mt-1" />
        )}
      </div>

      <AuthorField value={(form as any).author_name || ""} onChange={v => set("author_name", v)} readOnly={readOnly} />

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={() => { const { id: _id, survey_id, ...rest } = form as any; onSave(rest); }}>
            <Save className="h-4 w-4 mr-1" /> 저장
          </Button>
        </div>
      )}
    </div>
  );
}
