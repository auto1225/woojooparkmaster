/**
 * parking_lots 타입 안전 바인딩.
 *
 * 호출 빈도 1위 테이블 (38회). 백엔드 라우트(api/src/routes/parking-lots.ts)와 1:1 대응.
 */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export type LotType = "offstreet" | "onstreet" | "multilevel" | "vacant_lot" | "underground";
export type OperatorType = "direct" | "outsourced" | "other";
export type SurfaceType = "ascon" | "block" | "concrete" | "other";
export type PowerStatus = "supplied" | "available" | "unavailable";
export type LotStatus = "active" | "inactive" | "construction" | "closed";
export type SpaceType = "general" | "disabled" | "ev" | "compact" | "pregnant" | "motorcycle" | "other";

export interface ParkingLotRow {
  id: string;
  code: string;
  name: string;
  address_jibun: string | null;
  address_road: string | null;
  latitude: number | null;
  longitude: number | null;
  lot_type: LotType;
  total_spaces: number;
  disabled_spaces: number;
  ev_spaces: number;
  compact_spaces: number;
  pregnant_spaces: number;
  other_spaces: number;
  floors: number;
  floor_detail: unknown | null;
  area_sqm: number | null;
  operator_type: OperatorType;
  operator_name: string | null;
  surface_type: SurfaceType | null;
  operating_hours: unknown | null;
  fee_policy: unknown | null;
  has_gate: boolean;
  has_lpr: boolean;
  has_kiosk: boolean;
  has_cctv: boolean;
  has_display_board: boolean;
  has_sensor: boolean;
  control_system_linked: boolean;
  portal_linked: boolean;
  power_status: PowerStatus | null;
  network_type: string | null;
  status: LotStatus;
  notes: string | null;
  layout_data: unknown | null;
  author_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParkingSpaceRow {
  id: string;
  lot_id: string;
  floor: number;
  zone: string | null;
  space_number: string | null;
  space_type: SpaceType;
  has_sensor: boolean;
  sensor_id: string | null;
  status: string;
  created_at: string;
}

export interface ParkingLotWithSpaces extends ParkingLotRow {
  parking_spaces?: ParkingSpaceRow[];
}

export interface ParkingLotListQuery {
  status?: LotStatus;
  lot_type?: LotType;
  /** 검색어: name/code/address 부분일치 */
  q?: string;
  limit?: number;
  offset?: number;
}

export type ParkingLotCreateInput = Partial<Omit<ParkingLotRow, "id" | "created_at" | "updated_at" | "created_by">> & {
  code: string;
  name: string;
};

export type ParkingLotUpdateInput = Partial<ParkingLotCreateInput>;

const PATH = "/api/parking-lots";

export const parkingLotsApi = {
  list: (q: ParkingLotListQuery = {}) =>
    apiClient.get<ListResult<ParkingLotRow>>(PATH, q as Record<string, string | number | undefined>),

  get: (id: string, opts?: { includeSpaces?: boolean }) =>
    apiClient.get<ParkingLotWithSpaces>(
      `${PATH}/${id}`,
      opts?.includeSpaces ? { include: "spaces" } : undefined,
    ),

  create: (input: ParkingLotCreateInput) =>
    apiClient.post<ParkingLotRow>(PATH, input),

  update: (id: string, input: ParkingLotUpdateInput) =>
    apiClient.patch<ParkingLotRow>(`${PATH}/${id}`, input),

  remove: (id: string) =>
    apiClient.delete<void>(`${PATH}/${id}`),
};
