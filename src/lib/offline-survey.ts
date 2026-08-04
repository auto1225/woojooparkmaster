// ParkMaster™ 현장조사 오프라인 모드 — IndexedDB 기반
import { supabase } from "@/integrations/api/supabase-compat";
import { filesApi } from "@/integrations/api/files";
import { toast } from "sonner";

const DB_NAME = "parkmaster-offline";
const DB_VERSION = 2;
const STORE_SURVEYS = "pending-survey-steps";
const STORE_PHOTOS = "pending-photos";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        db.createObjectStore(STORE_SURVEYS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSurveyOffline(
  surveyId: string,
  table: string,
  recordId: string,
  data: any,
  baseSurveyUpdatedAt?: string | null,
) {
  const db = await openDB();
  const tx = db.transaction(STORE_SURVEYS, "readwrite");
  tx.objectStore(STORE_SURVEYS).put({
    id: `${surveyId}:${table}:${recordId}`,
    survey_id: surveyId,
    table,
    record_id: recordId,
    data,
    base_survey_updated_at: baseSurveyUpdatedAt || null,
    client_mutation_id: crypto.randomUUID(),
    timestamp: Date.now(),
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePhotoOffline(surveyId: string, blob: Blob, fileName: string, category: string, sortOrder: number) {
  const db = await openDB();
  const tx = db.transaction(STORE_PHOTOS, "readwrite");
  const id = `${surveyId}_${Date.now()}_${fileName}`;
  tx.objectStore(STORE_PHOTOS).put({ id, survey_id: surveyId, blob, file_name: fileName, category, sort_order: sortOrder, timestamp: Date.now() });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

export async function getPendingSurveys(): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_SURVEYS, "readonly");
  const store = tx.objectStore(STORE_SURVEYS);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingPhotos(surveyId?: string): Promise<any[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_PHOTOS, "readonly");
  const store = tx.objectStore(STORE_PHOTOS);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result;
      resolve(surveyId ? all.filter((p: any) => p.survey_id === surveyId) : all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function syncOfflineData(): Promise<{ surveys: number; photos: number }> {
  let syncedSurveys = 0;
  let syncedPhotos = 0;

  // Sync surveys
  const surveys = await getPendingSurveys();
  if (surveys.length > 0) {
    toast.info(`${surveys.length}건 동기화 중...`);
  }

  const surveysByRecord = new Map<string, any[]>();
  for (const pending of surveys) {
    const group = surveysByRecord.get(pending.survey_id) || [];
    group.push(pending);
    surveysByRecord.set(pending.survey_id, group);
  }

  for (const [surveyId, pendingSteps] of surveysByRecord) {
    try {
      const { data: parent, error: parentError } = await supabase
        .from("surveys")
        .select("status, updated_at")
        .eq("id", surveyId)
        .single();
      if (parentError) throw parentError;
      if (!["draft", "in_progress", "rejected"].includes(parent.status)) {
        toast.error("제출·승인된 조사의 오프라인 변경은 동기화하지 않았습니다.");
        continue;
      }

      const baseTimes = pendingSteps.map(step => step.base_survey_updated_at).filter(Boolean);
      if (baseTimes.length > 0 && !baseTimes.includes(parent.updated_at)) {
        toast.error("다른 사용자가 먼저 현황조사를 수정했습니다. 변경 내용을 확인한 뒤 다시 저장해 주세요.");
        continue;
      }

      let groupSucceeded = true;
      for (const pending of pendingSteps) {
        const { error } = await (supabase.from(pending.table as any) as any)
          .update(pending.data)
          .eq("id", pending.record_id);
        if (error) {
          groupSucceeded = false;
          console.error("Survey sync failed:", pending.survey_id, error);
          break;
        }
      }
      if (!groupSucceeded) continue;

      await supabase.from("surveys").update({ updated_at: new Date().toISOString() }).eq("id", surveyId);
      const db = await openDB();
      const tx = db.transaction(STORE_SURVEYS, "readwrite");
      for (const pending of pendingSteps) tx.objectStore(STORE_SURVEYS).delete(pending.id);
      await new Promise<void>((res, reject) => {
        tx.oncomplete = () => res();
        tx.onerror = () => reject(tx.error);
      });
      syncedSurveys += pendingSteps.length;
    } catch (e) {
      console.error("Survey sync failed:", surveyId, e);
    }
  }

  // Sync photos
  const photos = await getPendingPhotos();
  for (const p of photos) {
    try {
      const { data: parent, error: parentError } = await supabase.from("surveys").select("status").eq("id", p.survey_id).single();
      if (parentError) throw parentError;
      if (!["draft", "in_progress", "rejected"].includes(parent.status)) {
        toast.error("제출·승인된 조사의 대기 사진은 업로드하지 않았습니다.");
        continue;
      }
      const path = `${p.survey_id}/${p.category}/${p.file_name}`;
      const { error } = await supabase.storage.from("survey-photos").upload(path, p.blob, { upsert: false });
      if (!error) {
        const { error: metadataError } = await supabase.from("survey_photos").insert({
          survey_id: p.survey_id,
          category: p.category,
          file_path: path,
          sort_order: p.sort_order,
        });
        if (metadataError) {
          await supabase.storage.from("survey-photos").remove([path]);
          continue;
        }
        const db = await openDB();
        const tx = db.transaction(STORE_PHOTOS, "readwrite");
        tx.objectStore(STORE_PHOTOS).delete(p.id);
        await new Promise<void>((res) => { tx.oncomplete = () => res(); });
        syncedPhotos++;
      }
    } catch (e) {
      console.error("Photo sync failed:", p.id, e);
    }
  }

  if (syncedSurveys + syncedPhotos > 0) {
    toast.success("오프라인 데이터 동기화 완료");
    window.dispatchEvent(new CustomEvent("parkmaster:offline-sync"));
  }

  return { surveys: syncedSurveys, photos: syncedPhotos };
}

// Network status hook utility
export function setupOnlineSync() {
  const handler = () => {
    if (navigator.onLine) {
      syncOfflineData();
    }
  };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
