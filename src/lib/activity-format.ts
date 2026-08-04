const ACTION_LABELS: Record<string, string> = {
  assign: "담당자 배정",
  create: "등록",
  update: "수정",
  delete: "삭제",
  upload: "파일 등록",
  download: "파일 내려받기",
  document_create: "문서 등록",
  document_update: "문서 수정",
  link: "업무자료 연결",
  unlink: "업무자료 연결 해제",
};

const STATUS_LABELS: Record<string, string> = {
  received: "접수",
  assigned: "배정",
  in_progress: "처리중",
  pending_external: "외부 회신 대기",
  responded: "회신",
  closed: "완결",
  reopened: "재개",
  completed: "완료",
  verified: "검증 완료",
  approved: "승인",
  rejected: "반려",
};

export function formatActivityAction(action?: string | null): string {
  const raw = action?.trim() || "활동 기록";
  const statusChange = raw.match(/^상태변경(?:→|->)(.+)$/);
  if (statusChange) {
    const status = statusChange[1].trim();
    return `상태 변경 · ${STATUS_LABELS[status] || status}`;
  }
  return ACTION_LABELS[raw] || raw.replace(/_/g, " ");
}

export function formatActivityTarget(target?: string | null): string {
  const raw = target?.trim() || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
  } catch {
    // Keep non-JSON record labels as entered.
  }
  return raw.replace(/^["']|["']$/g, "");
}
