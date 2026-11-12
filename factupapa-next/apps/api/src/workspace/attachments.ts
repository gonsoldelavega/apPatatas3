import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "pg";
import type { SessionIdentity } from "../auth/repository.js";
import { withTenantTransaction } from "../database/client.js";
import { assertAllowedKeys } from "../domain/validation.js";
import { HttpError } from "../http/errors.js";
import { actorName } from "./common.js";

/** Almacén de archivos (MinIO en producción, memoria en las pruebas). */
export interface AttachmentStore {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class S3AttachmentStore implements AttachmentStore {
  private readonly client: S3Client;
  constructor(private readonly config: { endpoint: string; bucket: string; accessKey: string; secretKey: string }) {
    this.client = new S3Client({
      region: "us-east-1",
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }
  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: mimeType }));
  }
  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    if (!result.Body) throw new HttpError("not_found", 404);
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

export type AttachmentKind = "image" | "audio";

export interface AttachmentInput {
  kind: AttachmentKind;
  mimeType: string;
  data: Buffer;
  durationSeconds: number | null;
}

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
  createdByName: string;
  createdAt: string;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_PER_NOTE = 12;

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_MIMES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/aac", "audio/x-m4a", "audio/wav"]);

const startsWith = (data: Buffer, bytes: number[], offset = 0) => bytes.every((byte, index) => data[offset + index] === byte);

/** Comprueba que el contenido es de verdad lo que dice ser (no se fía solo del tipo declarado). */
export function matchesSignature(kind: AttachmentKind, data: Buffer): boolean {
  if (kind === "image") {
    return (
      startsWith(data, [0xff, 0xd8, 0xff]) ||
      startsWith(data, [0x89, 0x50, 0x4e, 0x47]) ||
      (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8))
    );
  }
  return (
    startsWith(data, [0x1a, 0x45, 0xdf, 0xa3]) || // webm / matroska
    startsWith(data, [0x66, 0x74, 0x79, 0x70], 4) || // mp4 / m4a (ftyp)
    startsWith(data, [0x4f, 0x67, 0x67, 0x53]) || // ogg
    startsWith(data, [0x49, 0x44, 0x33]) || // mp3 con ID3
    (data[0] === 0xff && ((data[1] ?? 0) & 0xe0) === 0xe0) || // mp3 / aac sin cabecera
    (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x41, 0x56, 0x45], 8)) // wav
  );
}

export function validateAttachment(body: Record<string, unknown>): AttachmentInput {
  assertAllowedKeys(body, ["kind", "mimeType", "data", "durationSeconds"]);
  const kind = body.kind;
  if (kind !== "image" && kind !== "audio") throw new HttpError("invalid_request", 400);
  if (typeof body.mimeType !== "string" || typeof body.data !== "string") throw new HttpError("invalid_request", 400);
  const mimeType = body.mimeType.split(";")[0]!.trim().toLowerCase();
  if (!(kind === "image" ? IMAGE_MIMES : AUDIO_MIMES).has(mimeType)) throw new HttpError("invalid_request", 400);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new HttpError("invalid_request", 400);
  const data = Buffer.from(body.data, "base64");
  if (data.length === 0 || data.length > (kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES)) throw new HttpError("payload_too_large", 413);
  if (!matchesSignature(kind, data)) throw new HttpError("invalid_request", 400);
  let durationSeconds: number | null = null;
  if (body.durationSeconds !== undefined && body.durationSeconds !== null) {
    if (typeof body.durationSeconds !== "number" || !Number.isInteger(body.durationSeconds) || body.durationSeconds < 0 || body.durationSeconds > 600) {
      throw new HttpError("invalid_request", 400);
    }
    durationSeconds = body.durationSeconds;
  }
  return { kind, mimeType, data, durationSeconds };
}

const columns = `id, kind, mime_type "mimeType", byte_size "byteSize", duration_seconds "durationSeconds",
  created_by_name "createdByName", created_at::text "createdAt"`;

/** Fotos y notas de voz de las notas comunes. */
export class NoteAttachmentsService {
  constructor(
    private readonly pool: Pool,
    private readonly store: AttachmentStore | undefined,
  ) {}

  private requireStore(): AttachmentStore {
    if (!this.store) throw new HttpError("storage_not_configured", 503);
    return this.store;
  }

  async add(identity: SessionIdentity, noteId: string, input: AttachmentInput): Promise<Attachment> {
    const store = this.requireStore();
    const id = randomUUID();
    const key = `${identity.companyId}/notes/${noteId}/${id}`;
    // Se comprueba la nota y el tope antes de subir el archivo.
    await withTenantTransaction(this.pool, identity, async (client) => {
      const note = await client.query("select 1 from shared_notes where id = $1 and archived_at is null", [noteId]);
      if (!note.rowCount) throw new HttpError("not_found", 404);
      const count = await client.query<{ n: number }>("select count(*)::int n from note_attachments where note_id = $1", [noteId]);
      if ((count.rows[0]?.n ?? 0) >= MAX_PER_NOTE) throw new HttpError("conflict", 409);
    });
    await store.put(key, input.data, input.mimeType);
    try {
      return await withTenantTransaction(this.pool, identity, async (client) => {
        const result = await client.query<Attachment>(
          `insert into note_attachments (id, company_id, note_id, kind, mime_type, byte_size, duration_seconds, storage_key, created_by_user_id, created_by_name)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${columns}`,
          [id, identity.companyId, noteId, input.kind, input.mimeType, input.data.length, input.durationSeconds, key, identity.userId, actorName(identity)],
        );
        return result.rows[0]!;
      });
    } catch (error) {
      await store.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async content(identity: SessionIdentity, noteId: string, attachmentId: string): Promise<{ body: Buffer; mimeType: string }> {
    const store = this.requireStore();
    const row = await withTenantTransaction(this.pool, identity, async (client) =>
      (
        await client.query<{ storageKey: string; mimeType: string }>(
          `select storage_key "storageKey", mime_type "mimeType" from note_attachments where id = $1 and note_id = $2`,
          [attachmentId, noteId],
        )
      ).rows[0],
    );
    if (!row) throw new HttpError("not_found", 404);
    return { body: await store.get(row.storageKey), mimeType: row.mimeType };
  }

  async remove(identity: SessionIdentity, noteId: string, attachmentId: string): Promise<void> {
    const store = this.requireStore();
    const key = await withTenantTransaction(this.pool, identity, async (client) =>
      (
        await client.query<{ storage_key: string }>(
          "delete from note_attachments where id = $1 and note_id = $2 returning storage_key",
          [attachmentId, noteId],
        )
      ).rows[0]?.storage_key,
    );
    if (!key) throw new HttpError("not_found", 404);
    await store.delete(key).catch(() => undefined);
  }
}
