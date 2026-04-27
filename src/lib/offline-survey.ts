// ParkMaster™ 현장조사 오프라인 모드 — IndexedDB 기반
import { supabase } from "@/integrations/api/supabase-compat";
import { filesApi } from "@/integrations/api/files";
import { toast } from "sonner";

const DB_NAME = "parkmaster-offline";
const DB_VERSION = 1;
const STORE_SURVEYS = "pending-surveys";
const STORE_PHOTOS = "pending-photos";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        db.createObjectStore(STORE_SURVEYS, { keyPath: "survey_id" });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSurveyOffline(surveyId: string, step: string, data: any) {
  const db = await openDB();
  const tx = db.transaction(STORE_SURVEYS, "readwrite");
  tx.objectStore(STORE_SURVEYS).put({
    survey_id: surveyId,
    step,
    data,
    timestamp: Date.now(),
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePhotoOffline(surveyId: string, blob: Blob, fileName: string) {
  const db = await openDB();
  const tx = db.transaction(STORE_PHOTOS, "readwrite");
  const id = `${surveyId}_${Date.now()}_${fileName}`;
  tx.objectStore(STORE_PHOTOS).put({ id, survey_id: surveyId, blob, file_name: fileName, timestamp: Date.now() });
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

  for (const s of surveys) {
    try {
      const { error } = await supabase
        .from("surveys")
        .update(s.data)
        .eq("id", s.survey_id);
      if (!error) {
        const db = await openDB();
        const tx = db.transaction(STORE_SURVEYS, "readwrite");
        tx.objectStore(STORE_SURVEYS).delete(s.survey_id);
        await new Promise<void>((res) => { tx.oncomplete = () => res(); });
        syncedSurveys++;
      }
    } catch (e) {
      console.error("Survey sync failed:", s.survey_id, e);
    }
  }

  // Sync photos
  const photos = await getPendingPhotos();
  for (const p of photos) {
    try {
      const path = `surveys/${p.survey_id}/${p.file_name}`;
      const _ul = await filesApi.legacyUpload("survey-photos", path, p.blob); const error = _ul.error;
      if (!error) {
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
