export type ImportEntityType = "contacts" | "products" | "contact_product_prices";
export type ImportSourceFormat = "csv" | "json";
export type ImportStatus = "pending" | "validated" | "importing" | "completed" | "failed" | "cancelled";
export type ImportClassification = "new" | "possible_update" | "duplicate" | "conflict" | "error";
export type ImportStrategy = "skip_existing" | "update_existing" | "fail_on_conflict";

export interface ImportLimits {
  maximumBytes: number;
  maximumRows: number;
  previewRows: number;
}

export interface ValidateImportInput {
  entityType: ImportEntityType;
  sourceFormat: ImportSourceFormat;
  content?: string;
  contentBase64?: string;
  mappingId?: string;
  mapping?: Record<string, string>;
}

export interface ParsedImport {
  bytes: Buffer;
  rows: Record<string, unknown>[];
  columns: string[];
}

export interface ImportMapping {
  id: string;
  name: string;
  entityType: ImportEntityType;
  sourceFormat: ImportSourceFormat;
  mapping: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportRowDraft {
  rowNumber: number;
  classification: ImportClassification;
  proposedAction: "create" | "update" | "skip" | "reject";
  normalizedData: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportBatch {
  id: string;
  entityType: ImportEntityType;
  sourceFormat: ImportSourceFormat;
  status: ImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  checksum: string;
  validationSummary: Record<string, unknown>;
  mappingUsed: Record<string, string>;
  createdAt: Date;
  validatedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}

export interface ImportBatchDetail extends ImportBatch {
  rows: ImportRowDraft[];
}
