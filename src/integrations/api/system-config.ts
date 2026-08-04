/** system_config 타입 안전 바인딩. 호출 6회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface SystemConfigRow {
  id: string;
  config_key: string;
  config_value: string;
  description: string | null;
  updated_at: string;
}

const PATH = "/api/system-config";

export const systemConfigApi = {
  list: (limit = 200, offset = 0) =>
    apiClient.get<ListResult<SystemConfigRow>>(PATH, { limit, offset }),
  /** key로 단건 조회 (가장 흔한 패턴) */
  getByKey: (key: string) => apiClient.get<SystemConfigRow>(`${PATH}/by-key/${encodeURIComponent(key)}`),
  /** UPSERT by key (admin 전용) */
  setByKey: (key: string, value: string, description?: string) =>
    apiClient.put<SystemConfigRow>(`${PATH}/by-key/${encodeURIComponent(key)}`, {
      config_value: value,
      description,
    }),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
