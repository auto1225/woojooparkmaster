import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { LOT_TYPE_LABELS, OPERATOR_LABELS, SURFACE_LABELS, POWER_LABELS, LOT_STATUS_LABELS } from "@/types/database";
import { Loader2 } from "lucide-react";
import { AuthorField } from "@/components/common/AuthorField";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  name: z.string().min(1, "주차장명을 입력하세요"),
  code: z.string().min(1, "코드를 입력하세요"),
  address_jibun: z.string().optional(),
  address_road: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  lot_type: z.enum(["offstreet", "onstreet", "multilevel", "vacant_lot", "underground"]),
  floors: z.coerce.number().min(1).default(1),
  operator_type: z.enum(["direct", "outsourced", "other"]),
  operator_name: z.string().optional(),
  surface_type: z.enum(["ascon", "block", "concrete", "other"]).optional(),
  total_spaces: z.coerce.number().min(0, "주차면수를 입력하세요"),
  power_status: z.enum(["supplied", "available", "unavailable"]).optional(),
  network_type: z.string().optional(),
  status: z.enum(["active", "inactive", "construction", "closed"]).default("active"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function LotNewPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [equipment, setEquipment] = useState({
    has_gate: false, has_lpr: false, has_kiosk: false, has_cctv: false,
    has_display_board: false, has_sensor: false, control_system_linked: false, portal_linked: false,
  });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { lot_type: "offstreet", operator_type: "direct", status: "active", floors: 1, total_spaces: 0 },
  });

  const lotType = watch("lot_type");
  const operatorType = watch("operator_type");

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    const { data: result, error } = await supabase.from("parking_lots").insert([{
      ...data,
      ...equipment,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      surface_type: data.surface_type || null,
      power_status: data.power_status || null,
    } as any]).select("id, name").single();

    setSaving(false);
    if (error) {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    } else {
      await logActivity({ module: "core", action: "create", targetType: "parking_lot", targetId: result.id, targetName: result.name });
      toast({ title: "저장되었습니다" });
      navigate(`/lots/${result.id}`);
    }
  };

  const EQUIP_ITEMS = [
    { key: "has_gate", label: "차단기" }, { key: "has_lpr", label: "LPR (차량번호인식)" },
    { key: "has_kiosk", label: "무인정산기" }, { key: "has_cctv", label: "CCTV" },
    { key: "has_display_board", label: "안내전광판" }, { key: "has_sensor", label: "주차면센서" },
    { key: "control_system_linked", label: "통합관제 연계" }, { key: "portal_linked", label: "주차포털 연계" },
  ];

  return (
    <DashboardLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
        <h2 className="text-lg font-semibold">주차장 등록</h2>

        <Card>
          <CardHeader><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">주차장명 *</Label>
                <Input {...register("name")} placeholder="예: 공항입구" />
                {errors.name && <p className="text-[10px] text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">코드 *</Label>
                <Input {...register("code")} placeholder="PL-124" />
                {errors.code && <p className="text-[10px] text-destructive">{errors.code.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">지번 주소</Label>
                <Input {...register("address_jibun")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">도로명 주소</Label>
                <Input {...register("address_road")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">위도</Label>
                <Input {...register("latitude")} type="number" step="any" placeholder="33.4996" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">경도</Label>
                <Input {...register("longitude")} type="number" step="any" placeholder="126.5312" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">분류 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">주차장 유형 *</Label>
              <RadioGroup defaultValue="offstreet" {...register("lot_type")} className="flex flex-wrap gap-3">
                {Object.entries(LOT_TYPE_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={k} id={`lot-${k}`} />
                    <Label htmlFor={`lot-${k}`} className="text-xs font-normal">{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            {lotType === "multilevel" && (
              <div className="space-y-1.5">
                <Label className="text-xs">층수</Label>
                <Input {...register("floors")} type="number" className="w-24" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">운영주체 *</Label>
              <RadioGroup defaultValue="direct" {...register("operator_type")} className="flex flex-wrap gap-3">
                {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={k} id={`op-${k}`} />
                    <Label htmlFor={`op-${k}`} className="text-xs font-normal">{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            {operatorType === "outsourced" && (
              <div className="space-y-1.5">
                <Label className="text-xs">위탁업체명</Label>
                <Input {...register("operator_name")} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">바닥 포장재</Label>
              <RadioGroup {...register("surface_type")} className="flex flex-wrap gap-3">
                {Object.entries(SURFACE_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={k} id={`sf-${k}`} />
                    <Label htmlFor={`sf-${k}`} className="text-xs font-normal">{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">총 주차면수 *</Label>
              <Input {...register("total_spaces")} type="number" className="w-32" />
              {errors.total_spaces && <p className="text-[10px] text-destructive">{errors.total_spaces.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">설비 현황</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {EQUIP_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={item.key}
                    checked={equipment[item.key as keyof typeof equipment]}
                    onCheckedChange={(checked) => setEquipment((prev) => ({ ...prev, [item.key]: !!checked }))}
                  />
                  <Label htmlFor={item.key} className="text-xs font-normal">{item.label}</Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">인프라</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">전기 공급</Label>
              <RadioGroup {...register("power_status")} className="flex flex-wrap gap-3">
                {Object.entries(POWER_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={k} id={`pw-${k}`} />
                    <Label htmlFor={`pw-${k}`} className="text-xs font-normal">{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">통신망</Label>
              <Input {...register("network_type")} placeholder="유선, Wi-Fi, LTE" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">상태</Label>
              <RadioGroup defaultValue="active" {...register("status")} className="flex flex-wrap gap-3">
                {Object.entries(LOT_STATUS_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-1.5">
                    <RadioGroupItem value={k} id={`st-${k}`} />
                    <Label htmlFor={`st-${k}`} className="text-xs font-normal">{v}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">비고</CardTitle></CardHeader>
          <CardContent>
            <Textarea {...register("notes")} rows={3} placeholder="비고 사항을 입력하세요" />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} 저장
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/lots")}>취소</Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
