import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatFacilityCurrency, formatFacilityDate, formatFacilityNumber } from "@/lib/facility-format";
import type { Equipment } from "@/types/facility";
import { EQUIPMENT_STATUS_COLORS, EQUIPMENT_STATUS_LABELS, EQUIPMENT_TYPE_LABELS } from "@/types/facility";

interface EquipmentDetailSheetProps {
  equipment: Equipment | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function EquipmentDetailSheet({ equipment, onOpenChange, open }: EquipmentDetailSheetProps) {
  const isMobile = useIsMobile();

  if (!equipment) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{EQUIPMENT_TYPE_LABELS[equipment.equipment_type] || equipment.equipment_type}</Badge>
            <Badge className={EQUIPMENT_STATUS_COLORS[equipment.status]}>{EQUIPMENT_STATUS_LABELS[equipment.status]}</Badge>
          </div>
          <SheetTitle className="pt-3 text-xl">{equipment.name}</SheetTitle>
          <SheetDescription>
            {equipment.equipment_code} · {equipment.parking_lots?.name || "주차장 정보 없음"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="grid grid-cols-2 gap-3">
            <InfoCard label="제조사" value={equipment.manufacturer || "-"} />
            <InfoCard label="모델명" value={equipment.model || "-"} />
            <InfoCard label="시리얼번호" value={equipment.serial_number || "-"} />
            <InfoCard label="수량" value={formatFacilityNumber(equipment.quantity, "대")} />
            <InfoCard label="층" value={equipment.floor != null ? `${equipment.floor}층` : "-"} />
            <InfoCard label="설치 위치" value={equipment.location_detail || "-"} />
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">운영 정보</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="설치일" value={formatFacilityDate(equipment.install_date)} />
              <DetailRow label="보증 만료일" value={formatFacilityDate(equipment.warranty_end)} />
              <DetailRow label="다음 점검 예정" value={formatFacilityDate(equipment.next_maintenance_date)} />
              <DetailRow label="마지막 점검일" value={formatFacilityDate(equipment.last_maintenance_date)} />
              <DetailRow label="교체 예정일" value={formatFacilityDate(equipment.replacement_due)} />
              <DetailRow label="내용연수" value={formatFacilityNumber(equipment.useful_life_years, "년")} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">비용 및 메모</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="취득원가" value={formatFacilityCurrency(equipment.purchase_cost)} />
              <DetailRow label="현재가치" value={formatFacilityCurrency(equipment.current_value)} />
              <DetailRow label="누적 유지보수비" value={formatFacilityCurrency(equipment.total_maintenance_cost)} />
              <DetailRow label="유지보수 횟수" value={formatFacilityNumber(equipment.maintenance_count, "회")} />
            </dl>
            <div className="mt-4 rounded-xl bg-muted/30 p-3 text-sm text-foreground">
              {equipment.notes || "등록된 메모가 없습니다."}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/30 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
