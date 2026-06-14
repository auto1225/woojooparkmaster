/** equipment 타입 안전 바인딩. 호출 7회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface EquipmentRow {
  id: string;
  lot_id: string;
  equipment_code: string;
  equipment_type: string;
  name: string;
  model: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  specification: unknown;
  install_date: string | null;
  warranty_start: string | null;
  warranty_end: string | null;
  useful_life_years: number | null;
  replacement_due: string | null;
  purchase_cost: number | null;
  current_value: number | null;
  depreciation_method: string;
  location_detail: string | null;
  floor: number | null;
  quantity: number;
  power_consumption: string | null;
  network_required: boolean;
  ip_address: string | null;
  firmware_version: string | null;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  total_maintenance_cost: number;
  maintenance_count: number;
  status: string;
  status_changed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentListQuery {
  lot_id?: string;
  equipment_type?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export type EquipmentCreateInput = Partial<Omit<EquipmentRow, "id" | "created_at" | "updated_at" | "created_by" | "total_maintenance_cost" | "maintenance_count" | "status_changed_at" | "last_maintenance_date" | "next_maintenance_date">> & {
  lot_id: string;
  equipment_code: string;
  equipment_type: string;
  name: string;
};
export type EquipmentUpdateInput = Partial<EquipmentCreateInput>;

const PATH = "/api/equipment";

export const equipmentApi = {
  list: (q: EquipmentListQuery = {}) =>
    apiClient.get<ListResult<EquipmentRow>>(PATH, q as Record<string, string | number | undefined>),
  get: (id: string) => apiClient.get<EquipmentRow>(`${PATH}/${id}`),
  create: (input: EquipmentCreateInput) => apiClient.post<EquipmentRow>(PATH, input),
  update: (id: string, input: EquipmentUpdateInput) => apiClient.patch<EquipmentRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
