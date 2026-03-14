import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activity-logger";
import { LOT_TYPE_LABELS, OPERATOR_LABELS, SURFACE_LABELS, POWER_LABELS, LOT_STATUS_LABELS } from "@/types/database";
import { Loader2, ArrowLeft } from "lucide-react";

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

const EQUIP_KEYS = [
  { key: "has_gate", label: "차단기" },
  { key: "has_lpr", label: "LPR (차량번호인식)" },
  { key: "has_kiosk", label: "무인정산기" },
  { key: "has_cctv", label: "CCTV" },
  { key: "has_display_board", label: "안내전광판" },
  { key: "has_sensor", label: "주차면센서" },
  { key: "control_system_linked", label: "통합관제 연계" },
  { key: "portal_linked", label: "주차포털 연계" },
] as const;

type EquipState = Record<(typeof EQUIP_KEYS)[number]["key"], boolean>;

export default function LotEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState<EquipState>({
    has_gate: false, has_lpr: false, has_kiosk: false, has_cctv: false,
    has_display_board: false, has_sensor: false, control_system_linked: false, portal_linked: false,
  });

  const { data: lot, isLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!lot) return;
    reset({
      name: lot.name,
      code: lot.code,
      address_jibun: lot.address_jibun ?? "",
      address_road: lot.address_road ?? "",
      latitude: lot.latitude ?? undefined,
      longitude: lot.longitude ?? undefined,
      lot_type: lot.lot_type as any,
      floors: lot.floors ?? 1,
      operator_type: lot.operator_type as any,
      operator_name: lot.operator_name ?? "",
      surface_type: lot.surface_type as any ?? undefined,
      total_spaces: lot.total_spaces ?? 0,
      power_status: lot.power_status as any ?? undefined,
      network_type: lot.network_type ?? "",
      status: lot.status as any,
      notes: lot.notes ?? "",
    });
    setEquipment({
      has_gate: lot.has_gate ?? false,
      has_lpr: lot.has_lpr ?? false,
      has_kiosk: lot.has_kiosk ?? false,
      has_cctv: lot.has_cctv ?? false,
      has_display_board: lot.has_display_board ?? false,
      has_sensor: lot.has_sensor ?? false,
      control_system_linked: lot.control_system_linked ?? false,
      portal_linked: lot.portal_linked ?? false,
    });
  }, [lot, reset]);

  const lotType = watch("lot_type");
  const operatorType = watch("operator_type");

  const onSubmit = async (data: FormData) => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.from("parking_lots").update({
      ...data,
      ...equipment,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      surface_type: data.surface_type || null,
      power_status: data.power_status || null,
    } as any).eq("id", id);

    setSaving(false);
    if (error) {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    } else {
      await logActivity({ module: "core", action: "update", targetType: "parking_lot", targetId: id, targetName: data.name });
      toast({ title: "수정되었습니다" });
      navigate(`/lots/${id}`);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!lot) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">주차장을 찾을 수 없습니다</p>
          <Button variant="outline" onClick={() => navigate("/lots")}>목록으로</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(`/lots/${id}`)} className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> 돌아가기
          </Button>
          <h2 className="text-lg font-semibold">주차장 수정</h2>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">기본 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">주차장명 *</Label>
                <Input {...register("name")} />
                {errors.name && <p className="text-[10px] text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">코드 *</Label>
                <Input {...register("code")} />
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
                <Input {...register("latitude")} type="number" step="any" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">경도</Label>
                <Input {...register("longitude")} type="number" step="any" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">분류 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">주차장 유형 *</Label>
              <RadioGroup value={lotType} onValueChange={(v) => reset((prev) => ({ ...prev, lot_type: v as any }))} className="flex flex-wrap gap-3">
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
              <RadioGroup value={operatorType} onValueChange={(v) => reset((prev) => ({ ...prev, operator_type: v as any }))} className="flex flex-wrap gap-3">
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
              <RadioGroup value={watch("surface_type") ?? ""} onValueChange={(v) => reset((prev) => ({ ...prev, surface_type: v as any }))} className="flex flex-wrap gap-3">
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
              {EQUIP_KEYS.map((item) => (
                <div key={item.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`edit-${item.key}`}
                    checked={equipment[item.key]}
                    onCheckedChange={(checked) => setEquipment((prev) => ({ ...prev, [item.key]: !!checked }))}
                  />
                  <Label htmlFor={`edit-${item.key}`} className="text-xs font-normal">{item.label}</Label>
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
              <RadioGroup value={watch("power_status") ?? ""} onValueChange={(v) => reset((prev) => ({ ...prev, power_status: v as any }))} className="flex flex-wrap gap-3">
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
              <Input {...register("network_type")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">상태</Label>
              <RadioGroup value={watch("status")} onValueChange={(v) => reset((prev) => ({ ...prev, status: v as any }))} className="flex flex-wrap gap-3">
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
            <Textarea {...register("notes")} rows={3} />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} 저장
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/lots/${id}`)}>취소</Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
