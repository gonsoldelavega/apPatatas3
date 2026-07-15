import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { _Object } from "@aws-sdk/client-s3";

async function bodyBytes(body: unknown): Promise<Buffer> {
  if (!body || typeof (body as { transformToByteArray?: unknown }).transformToByteArray !== "function") throw new Error("object_body_unavailable");
  return Buffer.from(await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
}

export async function backupAndVerifyObjects() {
  const endpoint = process.env.S3_ENDPOINT; const accessKeyId = process.env.S3_ACCESS_KEY; const secretAccessKey = process.env.S3_SECRET_KEY;
  const requiredBucket = process.env.S3_BUCKET ?? "factupapa-documents";
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Configuración S3 incompleta");
  const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  try {
  const root = path.resolve(process.env.OBJECT_BACKUP_DIRECTORY ?? "../../infrastructure/.object-backups");
  const backupId = `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomBytes(4).toString("hex")}`;
  const directory = path.join(root, backupId); await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const buckets = (await client.send(new ListBucketsCommand({}))).Buckets?.map((bucket) => bucket.Name).filter((name): name is string => Boolean(name)) ?? [];
  if (!buckets.includes(requiredBucket)) throw new Error("required_bucket_missing");
  const inventory: { key: string; size: number; checksum: string; contentType?: string; metadata: Record<string,string> }[] = [];
  const objects: _Object[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: requiredBucket, ...(continuationToken ? { ContinuationToken: continuationToken } : {}) }));
    objects.push(...(page.Contents ?? []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  for (const item of objects) {
    if (!item.Key) continue;
    const object = await client.send(new GetObjectCommand({ Bucket: requiredBucket, Key: item.Key }));
    const bytes = await bodyBytes(object.Body); const checksum = createHash("sha256").update(bytes).digest("hex");
    const filename = `${createHash("sha256").update(item.Key).digest("hex")}.object`;
    await writeFile(path.join(directory, filename), bytes, { mode: 0o600 });
    inventory.push({ key: item.Key, size: bytes.length, checksum, ...(object.ContentType ? { contentType: object.ContentType } : {}), metadata: object.Metadata ?? {} });
  }
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({ createdAt: new Date().toISOString(), buckets, sourceBucket: requiredBucket, objects: inventory }, null, 2)}\n`, { mode: 0o600 });
  const temporaryBucket = `verify-${randomBytes(8).toString("hex")}`;
  await client.send(new CreateBucketCommand({ Bucket: temporaryBucket }));
  try {
    for (const item of inventory) {
      const bytes = await readFile(path.join(directory, `${createHash("sha256").update(item.key).digest("hex")}.object`));
      await client.send(new PutObjectCommand({ Bucket: temporaryBucket, Key: item.key, Body: bytes, ContentType: item.contentType, Metadata: item.metadata }));
      const restored = await client.send(new GetObjectCommand({ Bucket: temporaryBucket, Key: item.key }));
      const restoredBytes = await bodyBytes(restored.Body);
      if (restoredBytes.length !== item.size || createHash("sha256").update(restoredBytes).digest("hex") !== item.checksum) throw new Error("object_restore_verification_failed");
      await client.send(new HeadObjectCommand({ Bucket: temporaryBucket, Key: item.key }));
    }
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(
        `${JSON.stringify({ status: "verified", manifest: manifestPath, buckets: buckets.length, objects: inventory.length })}\n`,
        (error) => (error ? reject(error) : resolve()),
      );
    });
  } finally {
    for (const item of inventory) await client.send(new DeleteObjectCommand({ Bucket: temporaryBucket, Key: item.key })).catch(() => undefined);
    await client.send(new DeleteBucketCommand({ Bucket: temporaryBucket })).catch(() => undefined);
    if (process.argv.includes("--discard-copy")) await rm(directory, { recursive: true, force: true });
  }
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  backupAndVerifyObjects()
    .then(() => process.exit(0))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ status:"failed", error:error instanceof Error ? error.message.replace(/[\r\n]/g," ").slice(0,200):"object_backup_failed" })}\n`);
      process.exitCode=1;
    });
