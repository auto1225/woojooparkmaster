import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { SurveyOperation } from "@/types/survey";
import { Save } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

interface Props {
  data: SurveyOperation | null | undefined;
  onSave: (data: Partial<SurveyOperation>) => void;
  readOnly?: boolean;
}

export function StepOperation({ data, onSave, readOnly }: Props) {
  const [form, setForm] = useState<Partial<SurveyOperation>>({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold">② 운영현황</h3>

      <div className="space-y-2">
        <Label className="text-xs font-medium">운영시간</Label>
        <RadioGroup value={form.operating_hours || ""} onValueChange={v => set("operating_hours", v)} className="flex gap-4" disabled={readOnly}>
          <div className="flex items-center space-x-2"><RadioGroupItem value="09:00-18:00" id="oh-1" /><Label htmlFor="oh-1" className="text-sm font-normal">09:00-18:00</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="oh-2" /><Label htmlFor="oh-2" className="text-sm font-normal">특정 시간대</Label></div>
        </RadioGroup>
        {form.operating_hours === "custom" && (
          <Input placeholder="운영시간 입력" value={form.operating_hours_custom || ""} onChange={e => set("operating_hours_custom", e.target.value)} disabled={readOnly} className="mt-2 w-60" />
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">결제방식</Label>
        <div className="flex flex-wrap gap-4">
          {[
            { key: "payment_cash", label: "현금" },
            { key: "payment_card", label: "카드" },
            { key: "payment_mobile", label: "모바일결제" },
            { key: "payment_none", label: "미결제" },
          ].map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <Checkbox id={p.key} checked={!!(form as any)[p.key]} onCheckedChange={v => set(p.key, v)} disabled={readOnly} />
              <Label htmlFor={p.key} className="text-sm font-normal">{p.label}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">관리인력</Label>
        <RadioGroup value={form.staff_type || ""} onValueChange={v => set("staff_type", v)} className="flex gap-4" disabled={readOnly}>
          <div className="flex items-center space-x-2"><RadioGroupItem value="resident" id="st-1" /><Label htmlFor="st-1" className="text-sm font-normal">상주</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="non-resident" id="st-2" /><Label htmlFor="st-2" className="text-sm font-normal">비상주</Label></div>
        </RadioGroup>
        {form.staff_type === "resident" && (
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs">인원수</Label>
            <Input type="number" className="w-20" value={form.staff_count ?? ""} onChange={e => set("staff_count", e.target.value ? Number(e.target.value) : null)} disabled={readOnly} />
            <span className="text-xs">명</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">관리방식</Label>
        <RadioGroup value={form.management_type || ""} onValueChange={v => set("management_type", v)} className="flex flex-wrap gap-4" disabled={readOnly}>
          {["수동발권", "무인정산기", "혼합", "기타"].map(v => (
            <div key={v} className="flex items-center space-x-2"><RadioGroupItem value={v} id={`mg-${v}`} /><Label htmlFor={`mg-${v}`} className="text-sm font-normal">{v}</Label></div>
          ))}
        </RadioGroup>
        {form.management_type === "기타" && (
          <Input placeholder="QR, APP 등" value={form.management_etc || ""} onChange={e => set("management_etc", e.target.value)} disabled={readOnly} className="mt-2 w-60" />
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">관제/포털 연계</Label>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id="ctrl" checked={!!form.control_linked} onCheckedChange={v => set("control_linked", v)} disabled={readOnly} />
            <Label htmlFor="ctrl" className="text-sm font-normal">통합주차관제 연계</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="portal" checked={!!form.portal_linked} onCheckedChange={v => set("portal_linked", v)} disabled={readOnly} />
            <Label htmlFor="portal" className="text-sm font-normal">주차포털 연계</Label>
          </div>
        </div>
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
