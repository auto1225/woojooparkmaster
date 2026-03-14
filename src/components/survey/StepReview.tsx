import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Check, X, Pencil } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PHOTO_CATEGORIES } from "@/types/survey";

interface Props {
  data: {
    survey: any;
    basic: any;
    operation: any;
    infra: any;
    usage: any;
    sensor: any;
    photos: any[];
  };
  onGoToStep: (step: number) => void;
  onSubmit: () => void;
  isReadOnly?: boolean;
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {ok ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
      <span className={`text-sm ${ok ? "" : "text-destructive"}`}>{label}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value?: string | number | null | boolean }) {
  const display = typeof value === "boolean" ? (value ? "예" : "아니오") : (value ?? "-");
  return (
    <div className="flex justify-between py-1 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{String(display)}</span>
    </div>
  );
}

export function StepReview({ data, onGoToStep, onSubmit, isReadOnly }: Props) {
  const { basic, operation, infra, usage, sensor, photos, survey } = data;
  const [notes, setNotes] = useState(survey?.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  const checks = [
    { label: "기본현황 입력 완료", ok: (basic?.total_spaces ?? 0) > 0 },
    { label: "운영현황 입력 완료", ok: !!operation?.operating_hours },
    { label: "인프라현황 입력 완료", ok: !!infra?.power_status },
    { label: "이용현황 입력 완료", ok: !!usage?.avg_usage_rate },
    { label: "센서설치예상 입력 완료", ok: (sensor?.planned_sensors ?? -1) >= 0 },
    { label: "사진 1장 이상 업로드", ok: photos.length > 0 },
  ];

  const allComplete = checks.every(c => c.ok);

  const saveNotes = async () => {
    setSavingNotes(true);
    await supabase.from("surveys").update({ notes } as any).eq("id", survey.id);
    toast({ title: "특이사항 저장됨" });
    setSavingNotes(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold">⑦ 최종검토</h3>

      {/* 기본현황 요약 */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-xs">기본현황</CardTitle>
          {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => onGoToStep(0)}><Pencil className="h-3 w-3 mr-1" />수정</Button>}
        </CardHeader>
        <CardContent>
          <SummaryRow label="주차장명" value={basic?.lot_name} />
          <SummaryRow label="주소" value={basic?.address} />
          <SummaryRow label="총 면수" value={basic?.total_spaces} />
          <SummaryRow label="장애인/전기차/경차/임산부" value={`${basic?.disabled_spaces || 0}/${basic?.ev_spaces || 0}/${basic?.compact_spaces || 0}/${basic?.pregnant_spaces || 0}`} />
        </CardContent>
      </Card>

      {/* 운영현황 요약 */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-xs">운영현황</CardTitle>
          {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => onGoToStep(1)}><Pencil className="h-3 w-3 mr-1" />수정</Button>}
        </CardHeader>
        <CardContent>
          <SummaryRow label="운영시간" value={operation?.operating_hours === "custom" ? operation?.operating_hours_custom : operation?.operating_hours} />
          <SummaryRow label="관리방식" value={operation?.management_type} />
          <SummaryRow label="관제연계" value={operation?.control_linked} />
        </CardContent>
      </Card>

      {/* 인프라 요약 */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-xs">인프라현황</CardTitle>
          {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => onGoToStep(2)}><Pencil className="h-3 w-3 mr-1" />수정</Button>}
        </CardHeader>
        <CardContent>
          <SummaryRow label="전기 공급" value={infra?.power_status} />
          <SummaryRow label="전광판 설치" value={infra?.display_installed} />
          <SummaryRow label="센서 설치" value={infra?.sensor_installed} />
        </CardContent>
      </Card>

      {/* 이용현황 + 센서 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs">이용현황</CardTitle>
            {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => onGoToStep(3)}><Pencil className="h-3 w-3 mr-1" />수정</Button>}
          </CardHeader>
          <CardContent>
            <SummaryRow label="이용률" value={usage?.avg_usage_rate} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs">센서설치예상</CardTitle>
            {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => onGoToStep(4)}><Pencil className="h-3 w-3 mr-1" />수정</Button>}
          </CardHeader>
          <CardContent>
            <SummaryRow label="센서" value={`${sensor?.planned_sensors ?? 0}대`} />
            <SummaryRow label="게이트웨이" value={`${sensor?.planned_gateways ?? 0}대`} />
          </CardContent>
        </Card>
      </div>

      {/* 사진 요약 */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-xs">사진대장</CardTitle>
          {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => onGoToStep(5)}><Pencil className="h-3 w-3 mr-1" />수정</Button>}
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">총 {photos.length}장</p>
          <div className="flex flex-wrap gap-1">
            {PHOTO_CATEGORIES.map(c => {
              const count = photos.filter((p: any) => p.category === c.code).length;
              return <Badge key={c.code} variant={count > 0 ? "default" : "outline"} className="text-[10px]">{c.label} {count}</Badge>;
            })}
          </div>
        </CardContent>
      </Card>

      {/* 특이사항 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">특이사항</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={isReadOnly} rows={3} placeholder="특이사항 입력..." />
          {!isReadOnly && (
            <Button variant="outline" size="sm" className="mt-2" onClick={saveNotes} disabled={savingNotes}>저장</Button>
          )}
        </CardContent>
      </Card>

      {/* 완료 체크리스트 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">완료 체크리스트</CardTitle></CardHeader>
        <CardContent>
          {checks.map((c, i) => <CheckItem key={i} {...c} />)}
        </CardContent>
      </Card>

      {/* 제출 버튼 */}
      {!isReadOnly && (
        <div className="flex justify-center pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" disabled={!allComplete} className="min-w-[200px]">
                조사 제출
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>조사 제출</AlertDialogTitle>
                <AlertDialogDescription>제출 후 수정이 불가합니다. 제출하시겠습니까?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={onSubmit}>제출</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {!allComplete && <p className="text-xs text-destructive ml-4 self-center">미완료 항목이 있습니다</p>}
        </div>
      )}
    </div>
  );
}
