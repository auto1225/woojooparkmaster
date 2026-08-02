import { Fragment } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, ChevronRight, MapPin, UserRound } from "lucide-react";

interface ScheduleListViewProps {
  isLoading: boolean;
  schedules: MaintenanceSchedule[];
  selectedScheduleId: string | null;
  onSelectSchedule: (schedule: MaintenanceSchedule) => void;
  groupByLot?: boolean;
}

export function ScheduleListView({
  isLoading,
  schedules,
  selectedScheduleId,
  onSelectSchedule,
  groupByLot = false,
}: ScheduleListViewProps) {
  const groups = groupByLot
    ? Array.from(schedules.reduce((map, schedule) => {
        const key = schedule.lot_id || "unassigned";
        const current = map.get(key) || { key, label: schedule.parking_lots?.name || "주차장 미지정", items: [] as MaintenanceSchedule[] };
        current.items.push(schedule);
        map.set(key, current);
        return map;
      }, new Map<string, { key: string; label: string; items: MaintenanceSchedule[] }>()).values())
    : [{ key: "all", label: "", items: schedules }];

  return (
    <>
    <div className="space-y-2 md:hidden">
      {schedules.map((schedule) => {
        const dueMeta = getScheduleDueMeta(schedule);
        return (
          <Card key={schedule.id} className="cursor-pointer" onClick={() => onSelectSchedule(schedule)}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-5">{schedule.schedule_name}</p>
                <Badge variant={dueMeta.variant}>{dueMeta.label}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{schedule.parking_lots?.name || "주차장 미지정"}</span>
                <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatScheduleDate(schedule.next_due_date)} · {getScheduleTypeLabel(schedule.schedule_type)}</span>
                <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{schedule.assignee?.name || "담당자 미지정"}</span>
              </div>
              <div className="flex justify-end border-t pt-2"><Button size="icon" variant="ghost" title="일정 상세"><ChevronRight className="h-4 w-4" /></Button></div>
            </CardContent>
          </Card>
        );
      })}
      {schedules.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">{isLoading ? "로딩 중..." : "등록된 스케줄이 없습니다"}</div>}
    </div>
    <div className="hidden overflow-x-auto md:block">
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
        {groups.map((group) => <Fragment key={group.key}>
          {groupByLot && <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={8} className="py-2 font-semibold">{group.label}<Badge variant="secondary" className="ml-2">{group.items.length}건</Badge></TableCell></TableRow>}
          {group.items.map((schedule) => {
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
        </Fragment>)}

        {schedules.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
              {isLoading ? "로딩 중..." : "등록된 스케줄이 없습니다"}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </div>
    </>
  );
}
