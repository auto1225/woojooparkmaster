/** notifications 타입 안전 바인딩. 호출 9회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface NotificationRow {
  id: string;
  user_id: string;
  module: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListQuery {
  user_id?: string;     // admin만 의미 있음
  is_read?: boolean;
  module?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationCreateInput {
  user_id: string;
  module: string;
  type?: string;
  title: string;
  message?: string;
  link?: string;
}

const PATH = "/api/notifications";

export const notificationsApi = {
  list: (q: NotificationListQuery = {}) =>
    apiClient.get<ListResult<NotificationRow>>(PATH, q as Record<string, string | number | boolean | undefined>),
  /** admin 전용: 시스템 알림 생성 */
  create: (input: NotificationCreateInput) => apiClient.post<NotificationRow>(PATH, input),
  /** 본인 알림을 읽음 처리 */
  markRead: (id: string) => apiClient.patch<NotificationRow>(`${PATH}/${id}/read`),
  /** 본인의 모든 미읽음 일괄 읽음 처리 */
  markAllRead: () => apiClient.patch<{ updated: number }>(`${PATH}/read-all`),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
