import type { FacilityPhotoRefType } from "@/lib/facility-field-work";

const DB_NAME = "parkmaster-local-files";
const DB_VERSION = 1;
const SETTINGS_STORE = "settings";
const PHOTO_STORE = "facility-photos";
const DIRECTORY_KEY = "facility-photo-directory";

type PermissionMode = "read" | "readwrite";

interface FileSystemFileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

interface FileSystemDirectoryHandleLike {
  name: string;
  queryPermission?(options?: { mode: PermissionMode }): Promise<PermissionState>;
  requestPermission?(options?: { mode: PermissionMode }): Promise<PermissionState>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
  removeEntry?(name: string): Promise<void>;
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode; startIn?: string }) => Promise<FileSystemDirectoryHandleLike>;
};

export type LocalFacilityPhoto = {
  id: string;
  refType: FacilityPhotoRefType;
  refId: string;
  category: string;
  fileName: string;
  relativePath: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  directoryName: string;
};

export type FacilityPhotoDirectoryStatus = {
  supported: boolean;
  configured: boolean;
  writable: boolean;
  directoryName: string;
};

const TYPE_FOLDER: Record<FacilityPhotoRefType, string> = {
  equipment: "장비",
  maintenance_log: "유지보수",
  safety_inspection: "안전점검",
  surface_marking: "노면표시",
};

let memoryDirectoryHandle: FileSystemDirectoryHandleLike | null = null;
let memoryPhotos: LocalFacilityPhoto[] = [];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("로컬 파일 색인을 사용할 수 없습니다."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName: string, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function savedDirectoryHandle() {
  if (memoryDirectoryHandle) return memoryDirectoryHandle;
  try {
    const saved = await dbGet<{ key: string; handle: FileSystemDirectoryHandleLike }>(SETTINGS_STORE, DIRECTORY_KEY);
    memoryDirectoryHandle = saved?.handle || null;
  } catch {
    memoryDirectoryHandle = null;
  }
  return memoryDirectoryHandle;
}

async function permission(handle: FileSystemDirectoryHandleLike, request = false) {
  const options = { mode: "readwrite" as const };
  const current = handle.queryPermission ? await handle.queryPermission(options) : "granted";
  if (current === "granted" || !request || !handle.requestPermission) return current;
  return handle.requestPermission(options);
}

export function facilityPhotoDirectorySupported() {
  return typeof window !== "undefined" && typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === "function";
}

export async function getFacilityPhotoDirectoryStatus(): Promise<FacilityPhotoDirectoryStatus> {
  const supported = facilityPhotoDirectorySupported();
  if (!supported) return { supported: false, configured: false, writable: false, directoryName: "" };
  const handle = await savedDirectoryHandle();
  if (!handle) return { supported: true, configured: false, writable: false, directoryName: "" };
  const access = await permission(handle).catch(() => "denied" as PermissionState);
  return { supported: true, configured: true, writable: access === "granted", directoryName: handle.name };
}

export async function chooseFacilityPhotoDirectory(): Promise<FacilityPhotoDirectoryStatus> {
  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
  if (!picker) throw new Error("폴더 직접 저장은 Chrome 또는 Edge 계열 브라우저에서 사용할 수 있습니다.");
  const handle = await picker.call(window, { id: "parkmaster-facility-photos", mode: "readwrite", startIn: "pictures" });
  const access = await permission(handle, true);
  if (access !== "granted") throw new Error("선택한 사진 폴더의 읽기·쓰기 권한이 필요합니다.");
  memoryDirectoryHandle = handle;
  try {
    await dbPut(SETTINGS_STORE, { key: DIRECTORY_KEY, handle, directoryName: handle.name });
  } catch {
    // Test browsers and older Chromium builds may not clone file handles; keep the active-page handle.
  }
  window.dispatchEvent(new CustomEvent("parkmaster:facility-photo-directory"));
  return { supported: true, configured: true, writable: true, directoryName: handle.name };
}

export function sanitizeLocalPhotoName(fileName: string) {
  const normalized = fileName.normalize("NFKC").replace(/[<>:"/\\|?*]/g, "_").trim();
  const withoutControls = [...normalized].map((character) => character.charCodeAt(0) < 32 ? "_" : character).join("");
  return withoutControls.replace(/\s+/g, "_").slice(-100) || "photo.jpg";
}

export function buildFacilityPhotoRelativePath(
  refType: FacilityPhotoRefType,
  refId: string,
  fileName: string,
  now = new Date(),
) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const timestamp = [year, month, String(now.getDate()).padStart(2, "0"), "_", String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0"), String(now.getSeconds()).padStart(2, "0")].join("");
  const recordFolder = refId.replace(/[^a-zA-Z0-9가-힣_-]/g, "_").slice(0, 80);
  const storedName = `${timestamp}_${crypto.randomUUID().slice(0, 8)}_${sanitizeLocalPhotoName(fileName)}`;
  return ["시설관리", TYPE_FOLDER[refType], year, month, recordFolder, storedName];
}

async function directoryAt(root: FileSystemDirectoryHandleLike, folders: string[], create: boolean) {
  let current = root;
  for (const folder of folders) current = await current.getDirectoryHandle(folder, { create });
  return current;
}

async function savePhotoMetadata(photo: LocalFacilityPhoto) {
  memoryPhotos = [photo, ...memoryPhotos.filter((item) => item.id !== photo.id)];
  try {
    await dbPut(PHOTO_STORE, photo);
  } catch {
    // The file is already safely written. Keep a same-session index as a fallback.
  }
}

async function writableDirectory() {
  const handle = await savedDirectoryHandle();
  if (!handle) throw new Error("먼저 사진 저장 폴더를 지정해 주세요.");
  if (await permission(handle) !== "granted") throw new Error("사진 저장 폴더 권한이 만료되었습니다. 폴더를 다시 지정해 주세요.");
  return handle;
}

export async function saveFacilityRecordPhotosLocally(
  refType: FacilityPhotoRefType,
  refId: string,
  files: File[],
  category = "record_photo",
) {
  const root = await writableDirectory();
  const results = await Promise.allSettled(files.map(async (file) => {
    const parts = buildFacilityPhotoRelativePath(refType, refId, file.name);
    const fileName = parts.at(-1)!;
    const parent = await directoryAt(root, parts.slice(0, -1), true);
    const fileHandle = await parent.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    const photo: LocalFacilityPhoto = {
      id: crypto.randomUUID(), refType, refId, category, fileName: file.name,
      relativePath: parts.join("/"), fileSize: file.size, mimeType: file.type,
      createdAt: new Date().toISOString(), directoryName: root.name,
    };
    await savePhotoMetadata(photo);
    return photo.relativePath;
  }));
  return {
    savedPaths: results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    saveErrors: results.flatMap((result, index) => result.status === "rejected"
      ? [`${files[index].name}: ${result.reason instanceof Error ? result.reason.message : "PC 저장 실패"}`]
      : []),
  };
}

export async function listLocalFacilityPhotos(refType: FacilityPhotoRefType, refId: string, category = "record_photo") {
  let photos = memoryPhotos;
  try {
    const persisted = await dbGetAll<LocalFacilityPhoto>(PHOTO_STORE);
    const merged = new Map([...persisted, ...memoryPhotos].map((photo) => [photo.id, photo]));
    photos = [...merged.values()];
  } catch {
    // Use the same-session index.
  }
  return photos
    .filter((photo) => photo.refType === refType && photo.refId === refId && photo.category === category)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLocalFacilityPhotoFile(photo: LocalFacilityPhoto) {
  const root = await writableDirectory();
  const parts = photo.relativePath.split("/");
  const parent = await directoryAt(root, parts.slice(0, -1), false);
  return (await parent.getFileHandle(parts.at(-1)!, { create: false })).getFile();
}
