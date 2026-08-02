import { supabase } from "@/integrations/supabase/client";
import { validateUploadFile, getSecureUploadPath } from "@/lib/file-security";
import type { ChecklistItem, SafetyInspection } from "@/types/facility";

const FIELD_EVIDENCE_BUCKET = "field-evidence";
const DEV_FALLBACK_BUCKET = "survey-photos";

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

export async function uploadMaintenanceEvidence(logId: string, file: File, userId: string) {
  const validation = await validateUploadFile(file, "image");
  if (!validation.isValid) throw new Error(validation.errors.join(" "));

  const location = await currentPosition();
  const clientMutationId = crypto.randomUUID();
  const path = `${userId}/maintenance/${logId}/${getSecureUploadPath("completion", file.name)}`;
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
    module: "FACILITY",
    ref_id: logId,
    ref_type: "maintenance_log",
    category: "completion_photo",
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
  if (metadataResult.error?.code === "PGRST204") {
    metadataResult = await supabase.from("attachments").insert(baseMetadata);
  }
  if (metadataResult.error) {
    await supabase.storage.from(bucket).remove([path]);
    throw metadataResult.error;
  }

  return storedPath;
}

export async function listMaintenanceEvidence(logId: string) {
  const { data, error } = await supabase.from("attachments")
    .select("id, file_name, file_path, file_size, mime_type, created_at")
    .eq("module", "FACILITY")
    .eq("ref_type", "maintenance_log")
    .eq("ref_id", logId)
    .eq("category", "completion_photo")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMaintenanceEvidenceUrl(filePath: string) {
  const location = storageLocation(filePath);
  const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function createSafetyCorrectiveWorkOrder(
  inspection: SafetyInspection,
  item: ChecklistItem,
  itemIndex: number,
  userId: string,
) {
  const compactId = inspection.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  const date = (inspection.inspection_date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const logNumber = `CW-${date}-${compactId}-${String(itemIndex + 1).padStart(2, "0")}`;
  const { data: existing, error: existingError } = await supabase.from("maintenance_logs")
    .select("id, log_number")
    .eq("log_number", logNumber)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const basePayload = {
    log_number: logNumber,
    lot_id: inspection.lot_id,
    maintenance_type: "safety_correction",
    priority: item.severity === "high" ? "high" : item.severity === "medium" ? "medium" : "low",
    title: `[안전점검 시정] ${item.item}`,
    description: `${inspection.inspection_number} ${item.category} 불합격 항목에서 생성된 시정 작업`,
    symptom: [item.note, inspection.issues_found].filter(Boolean).join("\n") || `${item.item} 불합격`,
    reported_by: userId,
    due_date: inspection.correction_deadline || null,
    status: "reported",
    parts_cost: 0,
    labor_cost: 0,
    other_cost: 0,
  };
  const linkedPayload = {
    ...basePayload,
    source_module: "FACILITY_SAFETY",
    source_record_id: inspection.id,
    source_item_key: `${item.category}:${item.item}`,
    next_action: "담당자 배정",
    idempotency_key: `safety:${inspection.id}:${itemIndex}`,
  };

  let result = await (supabase.from("maintenance_logs") as any).insert(linkedPayload).select("id, log_number").single();
  if (result.error?.code === "PGRST204") {
    result = await (supabase.from("maintenance_logs") as any).insert(basePayload).select("id, log_number").single();
  }
  if (result.error?.code === "23505") {
    const duplicate = await supabase.from("maintenance_logs").select("id, log_number").eq("log_number", logNumber).single();
    if (duplicate.error) throw duplicate.error;
    return duplicate.data;
  }
  if (result.error) throw result.error;
  return result.data;
}
