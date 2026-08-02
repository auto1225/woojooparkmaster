import { supabase } from "@/integrations/supabase/client";
import { getSecureUploadPath, validateUploadFile } from "@/lib/file-security";
import { getComplaintRule, getParkingLotWorkProfile } from "@/lib/parking-lot-work-profile";

const FIELD_EVIDENCE_BUCKET = "field-evidence";
const DEV_FALLBACK_BUCKET = "survey-photos";

export type FieldVisitOutcome = "confirmed" | "not_confirmed" | "immediate_action" | "follow_up_needed";

export interface ComplaintFieldChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface ComplaintFieldVisitInput {
  complaintId: string;
  complaintNumber: string;
  authorId: string;
  authorName: string;
  lotType?: string | null;
  subCategory?: string | null;
  status: string;
  visitedAt: string;
  outcome: FieldVisitOutcome;
  observation: string;
  actionTaken?: string;
  checkedItemIds: string[];
  captureLocation?: boolean;
}

export interface ComplaintEvidence {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  category: string | null;
  created_at: string | null;
}

export const FIELD_VISIT_OUTCOME_LABELS: Record<FieldVisitOutcome, string> = {
  confirmed: "민원 내용 확인",
  not_confirmed: "현장 이상 없음",
  immediate_action: "현장 즉시 조치",
  follow_up_needed: "추가 조치 필요",
};

const TYPE_SPECIFIC_CHECKS: Record<string, string[]> = {
  offstreet: ["포장·배수 상태", "차단기·정산기 작동", "조명·CCTV 상태", "보행·차량 동선 안전"],
  multilevel: ["층·구역·기둥번호 확인", "구조·누수 상태", "소방·비상설비 상태", "승강·환기설비 상태", "램프·보행 동선 안전"],
  onstreet: ["도로명·구간·진행방향 확인", "주차면·노면표시 상태", "센서·결제장비 상태", "상가·주택 진출입 영향", "보행·교통 안전"],
  underground: ["지하층·구역 확인", "침수·배수펌프 상태", "환기·공기질 상태", "소방·피난설비 상태", "램프·보행 동선 안전"],
  vacant_lot: ["구역·경계 확인", "노면·배수 상태", "펜스·볼라드 상태", "야간 조명·CCTV 상태"],
};

export function getComplaintFieldChecklist(lotType?: string | null, subCategory?: string | null): ComplaintFieldChecklistItem[] {
  const profile = getParkingLotWorkProfile(lotType);
  const rule = subCategory ? getComplaintRule(lotType, subCategory) : null;
  const common = [
    "민원 위치와 현장 위치 일치",
    "전체·근접 사진으로 현황 증빙",
    "안전 위험과 즉시 통제 필요 여부",
  ];
  const ruleCheck = rule ? [`민원 세부유형 확인: ${rule.label}`] : [];
  return [...common, ...ruleCheck, ...(TYPE_SPECIFIC_CHECKS[profile.type] || TYPE_SPECIFIC_CHECKS.offstreet)]
    .map((label, index) => ({ id: `${profile.type}-${index + 1}`, label, required: index < 3 }));
}

export function isFieldVerificationRequired(category?: string | null, lotType?: string | null, subCategory?: string | null) {
  const rule = subCategory ? getComplaintRule(lotType, subCategory) : null;
  return Boolean(rule?.createsMaintenanceWork || ["facility", "safety", "cleanliness"].includes(category || ""));
}

export function getComplaintNextAction(status: string, fieldRequired: boolean, fieldVisitCount: number, hasResponse: boolean) {
  if (status === "received") return "담당자와 담당팀을 배정하세요.";
  if (status === "assigned") return fieldRequired && fieldVisitCount === 0 ? "현장 확인을 등록하고 처리에 착수하세요." : "처리를 시작하세요.";
  if (status === "in_progress") {
    if (fieldRequired && fieldVisitCount === 0) return "회신 전에 현장 확인 또는 미실시 사유를 기록하세요.";
    return hasResponse ? "회신 내용을 검토하고 발송하세요." : "처리 결과를 정리하고 민원인에게 회신하세요.";
  }
  if (status === "pending_external") return "외부기관 회신 예정일을 확인하고 처리 재개 여부를 결정하세요.";
  if (status === "responded") return "회신·조치 근거를 확인한 뒤 완결하세요.";
  if (status === "reopened") return "재개 사유를 확인하고 재처리하세요.";
  if (status === "closed") return "만족도와 재민원 발생 여부를 추적하세요.";
  return "현재 상태와 담당자를 확인하세요.";
}

export function validateComplaintResponse(input: {
  response: string;
  responseType: string;
  fieldRequired: boolean;
  fieldVisitCount: number;
  noVisitReason?: string;
}) {
  const errors: string[] = [];
  if (!input.response.trim()) errors.push("회신 내용을 입력하세요.");
  if (!input.responseType) errors.push("회신 유형을 선택하세요.");
  if (input.fieldRequired && input.fieldVisitCount === 0 && !input.noVisitReason?.trim()) {
    errors.push("현장 확인을 등록하거나 미실시 사유를 입력하세요.");
  }
  return errors;
}

export function validateComplaintClosure(resolutionType: string, resolutionSummary: string, confirmed: boolean) {
  const errors: string[] = [];
  if (!resolutionType) errors.push("해결 유형을 선택하세요.");
  if (resolutionSummary.trim().length < 10) errors.push("종결 근거를 10자 이상 입력하세요.");
  if (!confirmed) errors.push("회신과 조치 근거 확인에 동의하세요.");
  return errors;
}

export function formatFieldVisitComment(input: ComplaintFieldVisitInput, checkedLabels: string[]) {
  const profile = getParkingLotWorkProfile(input.lotType);
  return [
    "[현장확인]",
    `확인시각: ${input.visitedAt.replace("T", " ")}`,
    `주차장 형태: ${profile.label}`,
    `확인결과: ${FIELD_VISIT_OUTCOME_LABELS[input.outcome]}`,
    `확인항목: ${checkedLabels.join(", ") || "없음"}`,
    `현장관찰: ${input.observation.trim()}`,
    `조치내용: ${input.actionTaken?.trim() || "현장 조치 없음"}`,
  ].join("\n");
}

function storageLocation(path: string) {
  const match = path.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  return match ? { bucket: match[1], path: match[2] } : { bucket: FIELD_EVIDENCE_BUCKET, path };
}

async function currentPosition() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<{ latitude: number; longitude: number; accuracy: number } | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 5_000 },
    );
  });
}

async function uploadComplaintEvidence(
  complaintId: string,
  file: File,
  userId: string,
  category: string,
  captureLocation: boolean,
) {
  const validation = await validateUploadFile(file, "image");
  if (!validation.isValid) throw new Error(validation.errors.join(" "));

  const location = captureLocation ? await currentPosition() : null;
  const clientMutationId = crypto.randomUUID();
  const path = `${userId}/complaint/${complaintId}/${getSecureUploadPath(category, file.name)}`;
  let bucket = FIELD_EVIDENCE_BUCKET;
  let upload = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upload.error && import.meta.env.DEV && /bucket not found/i.test(upload.error.message)) {
    bucket = DEV_FALLBACK_BUCKET;
    upload = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });
  }
  if (upload.error) throw upload.error;

  const storedPath = bucket === FIELD_EVIDENCE_BUCKET ? path : `${bucket}://${path}`;
  const baseMetadata = {
    module: "COMPLAINT",
    ref_id: complaintId,
    ref_type: "complaint",
    category,
    file_name: file.name,
    file_path: storedPath,
    file_size: file.size,
    mime_type: file.type || null,
    uploaded_by: userId,
  };
  const enrichedMetadata = {
    ...baseMetadata,
    captured_at: new Date().toISOString(),
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    location_accuracy_m: location?.accuracy ?? null,
    client_mutation_id: clientMutationId,
    device_platform: navigator.userAgent,
    sync_status: "synced",
  };
  let metadataResult = await (supabase.from("attachments") as any).insert(enrichedMetadata);
  if (metadataResult.error?.code === "PGRST204") metadataResult = await supabase.from("attachments").insert(baseMetadata);
  if (metadataResult.error) {
    await supabase.storage.from(bucket).remove([path]);
    throw metadataResult.error;
  }
  return storedPath;
}

export async function recordComplaintFieldVisit(input: ComplaintFieldVisitInput, files: File[]) {
  const checklist = getComplaintFieldChecklist(input.lotType, input.subCategory);
  const checkedLabels = checklist.filter((item) => input.checkedItemIds.includes(item.id)).map((item) => item.label);
  const content = formatFieldVisitComment(input, checkedLabels);
  const clientMutationId = crypto.randomUUID();
  const baseComment = {
    complaint_id: input.complaintId,
    author_id: input.authorId,
    author_name: input.authorName,
    content,
    comment_type: "field_visit",
  };
  const enrichedComment = {
    ...baseComment,
    client_mutation_id: clientMutationId,
    visit_occurred_at: new Date(input.visitedAt).toISOString(),
    visit_outcome: input.outcome,
    checklist_result: input.checkedItemIds,
    action_taken: input.actionTaken?.trim() || null,
    device_platform: navigator.userAgent,
    sync_status: "synced",
  };
  const rpcResult = await (supabase.rpc as any)("record_complaint_field_visit", {
    p_complaint_id: input.complaintId,
    p_client_mutation_id: clientMutationId,
    p_visit_occurred_at: new Date(input.visitedAt).toISOString(),
    p_visit_outcome: input.outcome,
    p_checklist_result: input.checkedItemIds,
    p_observation: input.observation.trim(),
    p_action_taken: input.actionTaken?.trim() || null,
    p_device_platform: navigator.userAgent,
  });
  const rpcUnavailable = rpcResult.error && (
    rpcResult.error.code === "PGRST202"
    || /record_complaint_field_visit|schema cache|could not find/i.test(rpcResult.error.message || "")
  );
  let commentId: string;
  if (!rpcResult.error) {
    commentId = rpcResult.data as string;
  } else if (rpcUnavailable) {
    let insert = await (supabase.from("complaint_comments") as any).insert(enrichedComment).select("id").single();
    if (insert.error?.code === "PGRST204") {
      insert = await supabase.from("complaint_comments").insert(baseComment).select("id").single();
    }
    if (insert.error) throw insert.error;
    commentId = insert.data.id;
  } else {
    throw rpcResult.error;
  }

  const uploadedPaths: string[] = [];
  const uploadErrors: string[] = [];
  for (const file of files) {
    try {
      uploadedPaths.push(await uploadComplaintEvidence(input.complaintId, file, input.authorId, "field_photo", Boolean(input.captureLocation)));
    } catch (error: any) {
      uploadErrors.push(`${file.name}: ${error.message || "업로드 실패"}`);
    }
  }
  if (uploadedPaths[0]) {
    await supabase.from("complaint_comments").update({ attachment_path: uploadedPaths[0] }).eq("id", commentId);
  }
  if (rpcUnavailable && ["assigned", "reopened"].includes(input.status)) {
    await supabase.from("complaints").update({ status: "in_progress" }).eq("id", input.complaintId);
  }
  return { commentId, uploadedPaths, uploadErrors };
}

export async function listComplaintEvidence(complaintId: string): Promise<ComplaintEvidence[]> {
  const { data, error } = await supabase.from("attachments")
    .select("id, file_name, file_path, file_size, mime_type, category, created_at")
    .eq("module", "COMPLAINT")
    .eq("ref_type", "complaint")
    .eq("ref_id", complaintId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as ComplaintEvidence[];
}

export async function getComplaintEvidenceUrl(filePath: string) {
  const location = storageLocation(filePath);
  const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 300);
  if (error) throw error;
  return data.signedUrl;
}
