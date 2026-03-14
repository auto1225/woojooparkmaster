/** SEC-C-4: 상태 전이 검증 (비즈니스 로직 우회 방지) */

const VALID_TRANSITIONS: Record<string, Record<string, string[]>> = {
  survey: {
    draft: ['in_progress'],
    in_progress: ['submitted'],
    submitted: ['review', 'rejected'],
    review: ['approved', 'rejected'],
    rejected: ['draft'],
    approved: [],
  },
  complaint: {
    received: ['assigned'],
    assigned: ['in_progress'],
    in_progress: ['responded', 'pending_external'],
    pending_external: ['in_progress'],
    responded: ['closed', 'reopened'],
    closed: [],
    reopened: ['in_progress'],
  },
  bid_project: {
    draft: ['review'],
    review: ['announced'],
    announced: ['bidding', 'cancelled'],
    bidding: ['closed', 'cancelled'],
    closed: ['evaluation'],
    evaluation: ['awarded', 'failed'],
    awarded: ['contracted'],
    contracted: [],
    cancelled: ['rebid'],
    failed: ['rebid'],
    rebid: ['announced'],
  },
  budget_plan: {
    draft: ['submitted'],
    submitted: ['approved', 'rejected'],
    approved: ['supplementary'],
    rejected: ['draft'],
    supplementary: ['submitted'],
  },
  budget_execution: {
    draft: ['requested'],
    requested: ['approved', 'rejected'],
    approved: ['executed'],
    rejected: ['draft'],
    executed: [],
  },
  service_project: {
    planning: ['in_progress', 'cancelled'],
    in_progress: ['inspection', 'suspended'],
    suspended: ['in_progress', 'cancelled'],
    inspection: ['completed', 'in_progress'],
    completed: ['warranty'],
    warranty: ['closed'],
    closed: [],
    cancelled: [],
  },
};

export function validateTransition(entity: string, currentStatus: string, newStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[entity]?.[currentStatus];
  if (!allowed) return true; // 정의되지 않은 엔터티는 허용
  return allowed.includes(newStatus);
}

export function getValidTransitions(entity: string, currentStatus: string): string[] {
  return VALID_TRANSITIONS[entity]?.[currentStatus] || [];
}
