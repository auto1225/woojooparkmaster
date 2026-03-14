import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { SurveyInfra } from "@/types/survey";
import { Save } from "lucide-react";

interface Props {
  data: SurveyInfra | null | undefined;
  onSave: (data: Partial<SurveyInfra>) => void;
  readOnly?: boolean;
}

export function StepInfra({ data, onSave, readOnly }: Props) {
  const [form, setForm] = useState<Partial<SurveyInfra>>({});
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);
  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold">③ 인프라현황</h3>

      {/* 전기 공급 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">전기 공급</Label>
        <RadioGroup value={form.power_status || ""} onValueChange={v => set("power_status", v)} className="flex gap-4" disabled={readOnly}>
          {[{ v: "supplied", l: "공급중" }, { v: "available", l: "가능" }, { v: "unavailable", l: "불가" }].map(o => (
            <div key={o.v} className="flex items-center space-x-2"><RadioGroupItem value={o.v} id={`pw-${o.v}`} /><Label htmlFor={`pw-${o.v}`} className="text-sm font-normal">{o.l}</Label></div>
          ))}
        </RadioGroup>
        <Input placeholder="비고" value={form.power_note || ""} onChange={e => set("power_note", e.target.value)} disabled={readOnly} className="w-60 mt-1" />
      </div>

      {/* 통신망 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">통신망</Label>
        <div className="flex flex-wrap gap-4">
          {[{ k: "network_wired", l: "유선" }, { k: "network_wifi", l: "Wi-Fi" }, { k: "network_lte", l: "LTE" }].map(n => (
            <div key={n.k} className="flex items-center gap-2">
              <Checkbox id={n.k} checked={!!(form as any)[n.k]} onCheckedChange={v => set(n.k, v)} disabled={readOnly} />
              <Label htmlFor={n.k} className="text-sm font-normal">{n.l}</Label>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Label className="text-xs">기타</Label>
            <Input value={form.network_etc || ""} onChange={e => set("network_etc", e.target.value)} disabled={readOnly} className="w-40 h-8" />
          </div>
        </div>
      </div>

      {/* 안내전광판 */}
      <div className="space-y-2 p-3 bg-muted/30 rounded-md">
        <Label className="text-xs font-medium">안내전광판</Label>
        <RadioGroup value={form.display_installed ? "yes" : "no"} onValueChange={v => set("display_installed", v === "yes")} className="flex gap-4" disabled={readOnly}>
          <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="di-y" /><Label htmlFor="di-y" className="text-sm font-normal">설치</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="di-n" /><Label htmlFor="di-n" className="text-sm font-normal">미설치</Label></div>
        </RadioGroup>
        {form.display_installed && (
          <div className="space-y-3 mt-2 pl-4 border-l-2 border-primary/20">
            <div className="flex gap-4">
              <div className="space-y-1">
                <Label className="text-[11px]">사용 여부</Label>
                <RadioGroup value={form.display_in_use ? "yes" : "no"} onValueChange={v => set("display_in_use", v === "yes")} className="flex gap-3" disabled={readOnly}>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="diu-y" /><Label htmlFor="diu-y" className="text-xs font-normal">사용</Label></div>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="diu-n" /><Label htmlFor="diu-n" className="text-xs font-normal">미사용</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">업체명</Label>
                <Input value={form.display_company || ""} onChange={e => set("display_company", e.target.value)} disabled={readOnly} className="w-40 h-8" />
              </div>
            </div>
            {!form.display_in_use && (
              <div className="space-y-1">
                <Label className="text-[11px]">미사용 사유</Label>
                <Input value={form.display_not_use_reason || ""} onChange={e => set("display_not_use_reason", e.target.value)} disabled={readOnly} className="w-60 h-8" />
              </div>
            )}
            <div className="flex gap-4">
              <div className="space-y-1">
                <Label className="text-[11px]">인터넷 연결</Label>
                <RadioGroup value={form.display_network || ""} onValueChange={v => set("display_network", v)} className="flex gap-3" disabled={readOnly}>
                  {["내부망", "외부망", "미연결"].map(v => (
                    <div key={v} className="flex items-center space-x-1"><RadioGroupItem value={v} id={`dn-${v}`} /><Label htmlFor={`dn-${v}`} className="text-xs font-normal">{v}</Label></div>
                  ))}
                </RadioGroup>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="space-y-1">
                <Label className="text-[11px]">SW 상태</Label>
                <RadioGroup value={form.display_sw_status || ""} onValueChange={v => set("display_sw_status", v)} className="flex gap-3" disabled={readOnly}>
                  {["사용", "미사용", "기타"].map(v => (
                    <div key={v} className="flex items-center space-x-1"><RadioGroupItem value={v} id={`ds-${v}`} /><Label htmlFor={`ds-${v}`} className="text-xs font-normal">{v}</Label></div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">SW 비고</Label>
                <Input value={form.display_sw_note || ""} onChange={e => set("display_sw_note", e.target.value)} disabled={readOnly} className="w-40 h-8" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 주차면센서 */}
      <div className="space-y-2 p-3 bg-muted/30 rounded-md">
        <Label className="text-xs font-medium">주차면센서</Label>
        <RadioGroup value={form.sensor_installed ? "yes" : "no"} onValueChange={v => set("sensor_installed", v === "yes")} className="flex gap-4" disabled={readOnly}>
          <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="si-y" /><Label htmlFor="si-y" className="text-sm font-normal">설치</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="si-n" /><Label htmlFor="si-n" className="text-sm font-normal">미설치</Label></div>
        </RadioGroup>
        {form.sensor_installed && (
          <div className="space-y-3 mt-2 pl-4 border-l-2 border-primary/20">
            <div className="flex gap-4 items-end">
              <div className="space-y-1"><Label className="text-[11px]">수량</Label><Input type="number" value={form.sensor_count ?? ""} onChange={e => set("sensor_count", Number(e.target.value))} disabled={readOnly} className="w-20 h-8" /></div>
              <div className="space-y-1">
                <Label className="text-[11px]">사용 여부</Label>
                <RadioGroup value={form.sensor_in_use ? "yes" : "no"} onValueChange={v => set("sensor_in_use", v === "yes")} className="flex gap-3" disabled={readOnly}>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="yes" id="siu-y" /><Label htmlFor="siu-y" className="text-xs font-normal">사용</Label></div>
                  <div className="flex items-center space-x-1"><RadioGroupItem value="no" id="siu-n" /><Label htmlFor="siu-n" className="text-xs font-normal">미사용</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-1"><Label className="text-[11px]">업체명</Label><Input value={form.sensor_company || ""} onChange={e => set("sensor_company", e.target.value)} disabled={readOnly} className="w-40 h-8" /></div>
            </div>
          </div>
        )}
      </div>

      {/* 관제설비 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">관제설비</Label>
        <div className="flex flex-wrap gap-4">
          {[{ k: "has_barrier", l: "차단기" }, { k: "has_lpr", l: "LPR" }, { k: "has_kiosk", l: "무인정산기" }, { k: "has_cctv", l: "CCTV" }].map(e => (
            <div key={e.k} className="flex items-center gap-2">
              <Checkbox id={e.k} checked={!!(form as any)[e.k]} onCheckedChange={v => set(e.k, v)} disabled={readOnly} />
              <Label htmlFor={e.k} className="text-sm font-normal">{e.l}</Label>
            </div>
          ))}
        </div>
        <Input placeholder="업체명" value={form.equipment_company || ""} onChange={e => set("equipment_company", e.target.value)} disabled={readOnly} className="w-60 mt-1" />
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
