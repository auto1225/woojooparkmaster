import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { logActivity } from "@/lib/activity-logger";
import type { BusinessCardFields } from "@/lib/business-card-ocr";

const GROUP_CODE = "BUSINESS_CARD";
const IMAGE_BUCKET = "business-cards";
const FALLBACK_IMAGE_BUCKET = "survey-photos";

export interface BusinessCard extends BusinessCardFields {
  id: string;
  memo: string;
  tags: string[];
  imagePath: string;
  imageName: string;
  createdAt: string;
  updatedAt: string;
}

type CardExtra = Omit<BusinessCard, "id" | "createdAt"> & { updatedAt?: string };

const rowToCard = (row: { id: string; name_ko: string; created_at: string | null; extra: Json | null }): BusinessCard => {
  const extra = (row.extra || {}) as CardExtra;
  return {
    id: row.id,
    name: extra.name || row.name_ko || "",
    company: extra.company || "",
    department: extra.department || "",
    position: extra.position || "",
    mobile: extra.mobile || "",
    phone: extra.phone || "",
    fax: extra.fax || "",
    email: extra.email || "",
    website: extra.website || "",
    address: extra.address || "",
    rawText: extra.rawText || "",
    memo: extra.memo || "",
    tags: Array.isArray(extra.tags) ? extra.tags : [],
    imagePath: extra.imagePath || "",
    imageName: extra.imageName || "",
    createdAt: row.created_at || "",
    updatedAt: extra.updatedAt || row.created_at || "",
  };
};

export async function listBusinessCards() {
  const { data, error } = await supabase.from("code_master")
    .select("id, name_ko, created_at, extra")
    .eq("group_code", GROUP_CODE).eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToCard);
}

export function matchesBusinessCard(card: BusinessCard, query: string) {
  const term = query.trim().toLocaleLowerCase("ko-KR");
  return [card.name, card.company, card.department, card.position, card.mobile, card.phone, card.fax,
    card.email, card.website, card.address, card.memo, ...card.tags]
    .some((value) => value.toLocaleLowerCase("ko-KR").includes(term));
}

async function uploadCardImage(cardId: string, file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("JPG, PNG, WEBP 명함 이미지만 등록할 수 있습니다.");
  if (file.size > 10 * 1024 * 1024) throw new Error("명함 이미지는 10MB 이하여야 합니다.");
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("명함 이미지를 저장하려면 로그인이 필요합니다.");
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const path = `${authData.user.id}/business-cards/${cardId}/${crypto.randomUUID()}.${extension}`;
  let bucket = IMAGE_BUCKET;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    if (!/bucket not found/i.test(error.message)) throw error;
    bucket = FALLBACK_IMAGE_BUCKET;
    const { error: fallbackError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
    if (fallbackError) throw fallbackError;
  }
  return bucket === IMAGE_BUCKET ? path : `${bucket}://${path}`;
}

export async function getBusinessCardImageUrl(path: string) {
  if (!path) return "";
  const location = storageLocation(path);
  const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveBusinessCard(card: Omit<BusinessCard, "createdAt" | "updatedAt">, image?: File | null) {
  const id = card.id || crypto.randomUUID();
  let imagePath = card.imagePath;
  if (image) imagePath = await uploadCardImage(id, image);
  const updatedAt = new Date().toISOString();
  const extra = { ...card, id: undefined, imagePath, imageName: image?.name || card.imageName, updatedAt } as unknown as Json;
  const payload = { group_code: GROUP_CODE, code: `BC-${id.replace(/-/g, "").slice(0, 32)}`, name_ko: card.name || card.company || "이름 미확인", name_en: card.company || null, is_active: true, extra };
  if (card.id) {
    const { error } = await supabase.from("code_master").update(payload).eq("id", id).eq("group_code", GROUP_CODE);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("code_master").insert({ ...payload, id });
    if (error) {
      if (imagePath && image) {
        const location = storageLocation(imagePath);
        await supabase.storage.from(location.bucket).remove([location.path]);
      }
      throw error;
    }
  }
  if (image && card.imagePath && card.imagePath !== imagePath) {
    const previous = storageLocation(card.imagePath);
    await supabase.storage.from(previous.bucket).remove([previous.path]);
  }
  await logActivity({ module: "BUSINESS_CARD", action: card.id ? "명함 수정" : "명함 등록", targetType: "business_card", targetId: id, targetName: card.name || card.company, details: { company: card.company, has_image: Boolean(imagePath) } });
  return id;
}

function storageLocation(storedPath: string) {
  const match = storedPath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  return { bucket: match?.[1] || IMAGE_BUCKET, path: match?.[2] || storedPath };
}

export async function archiveBusinessCard(card: BusinessCard) {
  const { error } = await supabase.from("code_master").update({ is_active: false }).eq("id", card.id).eq("group_code", GROUP_CODE);
  if (error) throw error;
  await logActivity({ module: "BUSINESS_CARD", action: "명함 삭제", targetType: "business_card", targetId: card.id, targetName: card.name });
}
