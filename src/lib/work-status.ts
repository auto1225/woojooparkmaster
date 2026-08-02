export const OPEN_COMPLAINT_STATUSES = [
  "received",
  "assigned",
  "in_progress",
  "pending_external",
  "responded",
  "reopened",
] as const;

export const OPEN_MAINTENANCE_STATUSES = [
  "reported",
  "assigned",
  "in_progress",
  "pending_parts",
  "completed",
] as const;

export const OPEN_COMPLAINT_STATUS_SET = new Set<string>(OPEN_COMPLAINT_STATUSES);
export const OPEN_MAINTENANCE_STATUS_SET = new Set<string>(OPEN_MAINTENANCE_STATUSES);
