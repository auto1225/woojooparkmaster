export type TeamRecordType =
  | "work_order"
  | "revenue_close"
  | "receivable_discount"
  | "workforce"
  | "capital_project"
  | "compliance";
export type TeamWorkStatus =
  | "registered"
  | "assigned"
  | "in_progress"
  | "review"
  | "completed"
  | "on_hold";
export type TeamWorkPriority = "urgent" | "high" | "normal" | "low";

export interface TeamWorkRecord {
  id: string;
  recordNumber: string;
  recordType: TeamRecordType;
  team: "operations" | "facilities";
  title: string;
  category: string;
  parkingLotId: string | null;
  parkingLot: string | null;
  parkingLotType: string | null;
  ownerId: string | null;
  ownerName: string | null;
  priority: TeamWorkPriority;
  status: TeamWorkStatus;
  dueDate: string | null;
  amount: number;
  documentNumber: string | null;
  reviewerName: string | null;
  nextAction: string | null;
  holdReason: string | null;
  sourceModule: string | null;
  sourceRecordId: string | null;
  sourcePath: string | null;
  rowVersion: number;
  archivedAt: string | null;
  archiveReason: string | null;
  payload: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface TeamWorkInput {
  recordType: TeamRecordType;
  team: "operations" | "facilities";
  title: string;
  category: string;
  parkingLotId?: string;
  parkingLot?: string;
  parkingLotType?: string;
  ownerId?: string;
  ownerName?: string;
  priority?: TeamWorkPriority;
  status?: TeamWorkStatus;
  dueDate?: string;
  amount?: number;
  documentNumber?: string;
  reviewerName?: string;
  nextAction?: string;
  holdReason?: string;
  sourceModule?: string;
  sourceRecordId?: string;
  sourcePath?: string;
  clientMutationId?: string;
  payload?: Record<string, string | number | boolean | null>;
}

export interface TeamWorkParkingLotOption {
  id: string;
  code: string;
  name: string;
  lotType: string | null;
}

export interface TeamWorkAssigneeOption {
  id: string;
  name: string;
  team: string | null;
}

export const TEAM_RECORD_LABELS: Record<TeamRecordType, string> = {
  work_order: "통합 업무지시",
  revenue_close: "수입마감·현금인계",
  receivable_discount: "미납·감면",
  workforce: "인력·복무",
  capital_project: "시설사업",
  compliance: "법정·정기점검",
};

export const TEAM_STATUS_LABELS: Record<TeamWorkStatus, string> = {
  registered: "접수",
  assigned: "배정",
  in_progress: "처리중",
  review: "검수대기",
  completed: "완료",
  on_hold: "보류",
};
