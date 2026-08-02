import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";

const CONTACT_GROUP = "RELATED_COMPANY_CONTACT";

export interface RelatedCompanyContact {
  id?: string;
  module: string;
  recordId: string;
  recordLabel: string;
  recordPath: string;
  companyName: string;
  managerName: string;
  phone: string;
  email: string;
  updatedAt?: string;
}

function contactCode(recordId: string) {
  return `VC-${recordId.replace(/-/g, "").slice(0, 32)}`;
}

function mapContact(row: any): RelatedCompanyContact {
  const extra = (row.extra || {}) as Record<string, string>;
  return {
    id: row.id,
    module: extra.module || "",
    recordId: extra.record_id || "",
    recordLabel: extra.record_label || row.name_ko || "",
    recordPath: extra.record_path || "",
    companyName: extra.company_name || row.name_ko || "",
    managerName: extra.manager_name || "",
    phone: extra.phone || row.name_en || "",
    email: extra.email || "",
    updatedAt: extra.updated_at || row.created_at,
  };
}

export function matchesRelatedCompanyContact(contact: RelatedCompanyContact, query: string) {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (!needle) return true;
  return [contact.companyName, contact.managerName, contact.phone, contact.email, contact.recordLabel]
    .some((value) => value.toLocaleLowerCase("ko-KR").includes(needle));
}

export async function listRelatedCompanyContacts(module?: string): Promise<RelatedCompanyContact[]> {
  const { data, error } = await supabase.from("code_master")
    .select("id, code, name_ko, name_en, extra, created_at")
    .eq("group_code", CONTACT_GROUP)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const contacts = (data || []).map(mapContact).filter((contact) => contact.recordId);
  return module ? contacts.filter((contact) => contact.module === module) : contacts;
}

export async function saveRelatedCompanyContact(contact: RelatedCompanyContact) {
  const code = contactCode(contact.recordId);
  const hasContact = Boolean(contact.companyName.trim() || contact.managerName.trim() || contact.phone.trim() || contact.email.trim());
  const { data: existing, error: readError } = await supabase.from("code_master")
    .select("id")
    .eq("group_code", CONTACT_GROUP)
    .eq("code", code)
    .maybeSingle();
  if (readError) throw readError;

  if (!hasContact) {
    if (existing) {
      const { error } = await supabase.from("code_master").update({ is_active: false }).eq("id", existing.id);
      if (error) throw error;
    }
    return null;
  }

  const now = new Date().toISOString();
  const payload = {
    name_ko: (contact.companyName.trim() || contact.recordLabel.trim() || "관련 업체").slice(0, 100),
    name_en: contact.phone.trim().slice(0, 100) || null,
    is_active: true,
    extra: {
      registry_version: 1,
      module: contact.module,
      record_id: contact.recordId,
      record_label: contact.recordLabel.trim(),
      record_path: contact.recordPath,
      company_name: contact.companyName.trim(),
      manager_name: contact.managerName.trim(),
      phone: contact.phone.trim(),
      email: contact.email.trim(),
      updated_at: now,
    } as any,
  };
  const result = existing
    ? await supabase.from("code_master").update(payload).eq("id", existing.id).select("id, code, name_ko, name_en, extra, created_at").single()
    : await supabase.from("code_master").insert({ group_code: CONTACT_GROUP, code, sort_order: 0, ...payload }).select("id, code, name_ko, name_en, extra, created_at").single();
  if (result.error) throw result.error;
  await logActivity({
    module: "RELATED_COMPANY",
    action: existing ? "연락망수정" : "연락망등록",
    targetType: contact.module,
    targetId: contact.recordId,
    targetName: contact.recordLabel,
    details: { company_name: contact.companyName, manager_name: contact.managerName },
  });
  return mapContact(result.data);
}

export function indexRelatedCompanyContacts(contacts: RelatedCompanyContact[]) {
  return new Map(contacts.map((contact) => [contact.recordId, contact]));
}
