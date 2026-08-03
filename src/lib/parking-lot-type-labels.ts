import { LOT_TYPE_LABELS } from "@/types/database";

export const PARKING_LOT_TYPE_LABELS: Record<string, string> = {
  ...LOT_TYPE_LABELS,
  off_street: "노외주차장",
  on_street: "노상주차장",
  building: "주차빌딩",
};

export const PRIMARY_PARKING_LOT_TYPES = ["offstreet", "multilevel", "onstreet"] as const;

export function getParkingLotTypeLabel(value?: string | null) {
  return value ? PARKING_LOT_TYPE_LABELS[value] || value : "형태 미확인";
}
