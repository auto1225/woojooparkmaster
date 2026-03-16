import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { SurveyUsage } from "@/types/survey";
import { Save } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";

interface Props {
  data: SurveyUsage | null | undefined;
  onSave: (data: Partial<SurveyUsage>) => void;
  readOnly?: boolean;
}

export function StepUsage({ data, onSave, readOnly }: Props) {
  const [form, setForm] = useState<Partial<SurveyUsage>>({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold">④ 이용현황</h3>

      <div className="space-y-2">
        <Label className="text-xs font-medium">평균 이용률</Label>
        <RadioGroup value={form.avg_usage_rate || ""} onValueChange={v => set("avg_usage_rate", v)} className="flex flex-wrap gap-4" disabled={readOnly}>
          {["0~30%", "~60%", "~90%", "~100%"].map(v => (
            <div key={v} className="flex items-center space-x-2"><RadioGroupItem value={v} id={`ur-${v}`} /><Label htmlFor={`ur-${v}`} className="text-sm font-normal">{v}</Label></div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">혼잡시간대</Label>
        <div className="flex flex-wrap gap-4">
          {[
            { k: "peak_morning", l: "오전" },
            { k: "peak_afternoon", l: "오후" },
            { k: "peak_night", l: "야간" },
            { k: "peak_free_time", l: "무료 개방시간" },
          ].map(p => (
            <div key={p.k} className="flex items-center gap-2">
              <Checkbox id={p.k} checked={!!(form as any)[p.k]} onCheckedChange={v => set(p.k, v)} disabled={readOnly} />
              <Label htmlFor={p.k} className="text-sm font-normal">{p.l}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">이용객 특성</Label>
        <div className="flex flex-wrap gap-4">
          {[
            { k: "user_residents", l: "인근주민" },
            { k: "user_commercial", l: "상권이용객" },
            { k: "user_tourists", l: "관광객" },
          ].map(u => (
            <div key={u.k} className="flex items-center gap-2">
              <Checkbox id={u.k} checked={!!(form as any)[u.k]} onCheckedChange={v => set(u.k, v)} disabled={readOnly} />
              <Label htmlFor={u.k} className="text-sm font-normal">{u.l}</Label>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs">기타</Label>
          <Input value={form.user_etc || ""} onChange={e => set("user_etc", e.target.value)} disabled={readOnly} className="w-60 h-8" />
        </div>
      </div>

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
