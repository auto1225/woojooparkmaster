export type DocumentDirection = "outgoing" | "incoming" | "internal";
export type DocumentRelationType = "primary" | "reference" | "evidence" | "reply";
export type DocumentStatus = "draft" | "registered" | "sent" | "received" | "archived";

export interface OfficialDocument {
  id: string;
  documentNumber: string;
  normalizedNumber: string;
  title: string;
  direction: DocumentDirection;
  documentType: string;
  documentDate: string | null;
  senderOrganization: string | null;
  receiverOrganization: string | null;
  department: string | null;
  securityLevel: string;
  retentionPeriod: string | null;
  status: DocumentStatus;
  notes: string | null;
  createdAt: string;
  linkCount?: number;
}

export interface OfficialDocumentInput {
  documentNumber: string;
  title: string;
  direction?: DocumentDirection;
  documentType?: string;
  documentDate?: string;
  senderOrganization?: string;
  receiverOrganization?: string;
  department?: string;
  securityLevel?: string;
  retentionPeriod?: string;
  status?: DocumentStatus;
  notes?: string;
}

export interface DocumentLink {
  id: string;
  documentId: string;
  module: string;
  recordId: string;
  relationType: DocumentRelationType;
  recordPath: string | null;
  recordLabel: string | null;
  createdAt: string;
}

export interface DocumentActivity {
  id: string;
  action: string;
  userName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface OfficialDocumentFile {
  id: string;
  documentId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: string;
}
