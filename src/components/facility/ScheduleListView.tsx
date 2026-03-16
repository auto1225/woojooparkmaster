import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MaintenanceSchedule } from "@/types/facility";
import {
  formatScheduleDate,
  getScheduleDueMeta,
  getScheduleTypeClassName,
  getScheduleTypeLabel,
} from "@/lib/facility-schedule";
import { cn } from "@/lib/utils";

interface ScheduleListViewProps {
  isLoading: boolean;
  schedules: MaintenanceSchedule[];
  selectedScheduleId: string | null;
  onSelectSchedule: (schedule: MaintenanceSchedule) => void;
}

export function ScheduleListView({
  isLoading,
  schedules,
  selectedScheduleId,
  onSelectSchedule,
}: ScheduleListViewProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>점검명</TableHead>
          <TableHead>주차장</TableHead>
          <TableHead>장비</TableHead>
          <TableHead>주기</TableHead>
          <TableHead>담당자</TableHead>
          <TableHead>다음 점검일</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="text-right">상세</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {schedules.map((schedule) => {
          const dueMeta = getScheduleDueMeta(schedule);

          return (
            <TableRow
              key={schedule.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/40",
                selectedScheduleId === schedule.id && "bg-muted/40",
              )}
              onClick={() => onSelectSchedule(schedule)}
            >
              <TableCell className="font-medium">{schedule.schedule_name}</TableCell>
              <TableCell>{schedule.parking_lots?.name || "-"}</TableCell>
              <TableCell>{schedule.equipment?.name || "-"}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("border", getScheduleTypeClassName(schedule.schedule_type))}>
                  {getScheduleTypeLabel(schedule.schedule_type)}
                </Badge>
              </TableCell>
              <TableCell>{schedule.assignee?.name || "-"}</TableCell>
              <TableCell>{formatScheduleDate(schedule.next_due_date)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={schedule.is_active ? "default" : "secondary"}>
                    {schedule.is_active ? "활성" : "비활성"}
                  </Badge>
                  <Badge variant={dueMeta.variant}>{dueMeta.label}</Badge>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="ghost" size="sm" onClick={() => onSelectSchedule(schedule)}>
                  보기
                </Button>
              </TableCell>
            </TableRow>
          );
        })}

        {schedules.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
              {isLoading ? "로딩 중..." : "등록된 스케줄이 없습니다"}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
