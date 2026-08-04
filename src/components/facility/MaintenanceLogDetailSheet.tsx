import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatFacilityCurrency, formatFacilityDateTime, formatFacilityNumber } from "@/lib/facility-format";
import type { MaintenanceLog } from "@/types/facility";
import { MAINT_STATUS_LABELS, MAINT_TYPE_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/facility";
import { DocumentLinksPanel } from "@/components/documents/DocumentLinksPanel";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BriefcaseBusiness, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LinkedBusinessContacts } from "@/components/business-cards/LinkedBusinessContacts";
import { FacilityPhotoGallery } from "@/components/facility/FacilityPhotoGallery";

interface MaintenanceLogDetailSheetProps {
  log: MaintenanceLog | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function MaintenanceLogDetailSheet({ log, onOpenChange, open }: MaintenanceLogDetailSheetProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const legacyComplaintNumber = log?.source_module === "COMPLAINT"
    ? null
    : log?.description?.match(/\bCM-\d{8}-\d+\b/)?.[0] || null;
  const { data: legacyComplaint } = useQuery({
    queryKey: ["maintenance-source-complaint", legacyComplaintNumber],
    queryFn: async () => {
      const { data, error } = await supabase.from("complaints")
        .select("id, complaint_number")
        .eq("complaint_number", legacyComplaintNumber!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(open && !log?.source_record_id && legacyComplaintNumber),
  });

  if (!log) return null;

  const sourceComplaintId = log.source_module === "COMPLAINT" && log.source_record_id
    ? log.source_record_id
    : legacyComplaint?.id;
  const suggestedDueDate = (() => {
    if (log.due_date) return log.due_date.slice(0, 10);
    const days = log.parking_lots?.lot_type === "onstreet" ? 2 : log.parking_lots?.lot_type === "multilevel" ? 3 : 5;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  })();

  const parts = Array.isArray(log.parts_used) ? log.parts_used : [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={PRIORITY_COLORS[log.priority]}>{PRIORITY_LABELS[log.priority]}</Badge>
            <Badge variant="outline">{MAINT_TYPE_LABELS[log.maintenance_type] || log.maintenance_type}</Badge>
            <Badge variant="secondary">{MAINT_STATUS_LABELS[log.status]}</Badge>
          </div>
          <SheetTitle className="pt-3 text-xl">{log.title}</SheetTitle>
          <SheetDescription>
            {log.log_number} · {log.parking_lots?.name || "주차장 정보 없음"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <Button className="w-full" variant="outline" onClick={() => navigate(`/team-work?new=1&tab=work_order&team=facilities&category=${encodeURIComponent("시설보수")}&title=${encodeURIComponent(`[${log.log_number}] ${log.title}`)}&parkingLotId=${log.lot_id}&ownerId=${log.assigned_to || ""}&dueDate=${suggestedDueDate}&sourceModule=facility_maintenance&sourceRecordId=${log.id}&sourcePath=${encodeURIComponent(`/facility/maintenance?work=${log.id}`)}`)}><BriefcaseBusiness className="mr-2 h-4 w-4" />팀 업무로 연계</Button>
          {sourceComplaintId && (
            <section className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">민원에서 생성된 시설작업</p>
                <p className="mt-1 text-sm text-muted-foreground">원 민원의 처리 내용과 현장 결과를 함께 확인하세요.</p>
              </div>
              <Button
                className="shrink-0"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigate(`/complaints/${sourceComplaintId}`);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />원 민원 보기
              </Button>
            </section>
          )}
          <section className="grid grid-cols-2 gap-3">
            <InfoCard label="장비" value={log.equipment?.name || "-"} />
            <InfoCard label="우선순위" value={PRIORITY_LABELS[log.priority]} />
            <InfoCard label="신고일" value={formatFacilityDateTime(log.reported_at)} />
            <InfoCard label="담당자" value={log.assignee?.name || "미배정"} />
            <InfoCard label="처리 기한" value={log.due_date || "-"} />
            <InfoCard label="완료일" value={formatFacilityDateTime(log.completed_at)} />
          </section>
          <FacilityPhotoGallery refType="maintenance_log" refId={log.id} title="접수·고장 현장 사진" />

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">작업 내용</h3>
            <div className="mt-4 space-y-3 text-sm text-foreground">
              <DetailBlock label="설명" value={log.description || "-"} />
              <DetailBlock label="증상" value={log.symptom || "-"} />
              <DetailBlock label="원인" value={log.cause || "-"} />
              <DetailBlock label="조치 내용" value={log.resolution || "-"} />
              <DetailBlock label="비고" value={log.notes || "-"} />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">비용 정보</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="부품비" value={formatFacilityCurrency(log.parts_cost)} />
              <DetailRow label="인건비" value={formatFacilityCurrency(log.labor_cost)} />
              <DetailRow label="기타비" value={formatFacilityCurrency(log.other_cost)} />
              <DetailRow label="총 비용" value={formatFacilityCurrency(log.total_cost)} />
              <DetailRow label="작업 시간" value={formatFacilityNumber(log.labor_hours, "시간")} />
              <DetailRow label="다운타임" value={formatFacilityNumber(log.downtime_hours, "시간")} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">사용 부품</h3>
              <span className="text-xs text-muted-foreground">총 {parts.length}건</span>
            </div>
            {parts.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {parts.map((part, index) => (
                  <li key={`${part.name}-${index}`} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{part.name}</p>
                      <p className="text-xs text-muted-foreground">수량 {part.qty}</p>
                    </div>
                    <span className="font-medium text-foreground">{formatFacilityCurrency(part.unit_cost)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">등록된 부품 내역이 없습니다.</p>
            )}
          </section>

          <FacilityPhotoGallery refType="maintenance_log" refId={log.id} title="현장 완료 증빙" category="completion_photo" />

          <section className="rounded-2xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">관련 업체 연락망</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailRow label="업체명" value={log.vendor_name || "-"} />
              <DetailRow label="업체 담당자" value={log.vendor_manager || "-"} />
              <DetailRow label="담당자 연락처" value={log.vendor_phone || log.vendor_contact || "-"} />
              <DetailRow label="담당자 이메일" value={log.vendor_email || "-"} />
            </dl>
          </section>
          <LinkedBusinessContacts module="FACILITY_MAINTENANCE" recordId={log.id} title="연결된 시설업체 담당자" />
          <DocumentLinksPanel
            module="FACILITY_MAINTENANCE"
            recordId={log.id}
            recordPath={`/facility/maintenance?work=${log.id}`}
            recordTitle={`${log.log_number} ${log.title}`}
          />
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

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value}</p>
    </div>
  );
}
