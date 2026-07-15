import { connect } from "node:net";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { Database } from "../database/client.js";

export interface Readiness { check(): Promise<Record<string, "ok" | "unavailable" | "incomplete" | "misconfigured">> }

async function deadline<T>(promise: Promise<T>, timeoutMs: number, abort?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => { abort?.(); reject(new Error("timeout")); }, timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

function redisPing(redisUrl: string, timeoutMs: number): Promise<void> {
  const url = new URL(redisUrl);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 6379) });
    let data = "";
    const password = decodeURIComponent(url.password);
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error("timeout")); });
    socket.once("error", reject);
    socket.once("connect", () => socket.write(password ? `*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(password)}\r\n${password}\r\n*1\r\n$4\r\nPING\r\n` : "*1\r\n$4\r\nPING\r\n"));
    socket.on("data", (chunk) => { data += chunk; if (data.includes("+PONG")) { socket.end(); resolve(); } else if (data.includes("-ERR")) { socket.destroy(); reject(new Error("redis unavailable")); } });
  });
}

export function createReadiness(options: {
  database: Database; timeoutMs: number; redisUrl?: string; s3?: { endpoint: string; bucket: string; accessKey: string; secretKey: string };
}): Readiness {
  const s3 = options.s3 ? new S3Client({ region: "us-east-1", endpoint: options.s3.endpoint, forcePathStyle: true, credentials: { accessKeyId: options.s3.accessKey, secretAccessKey: options.s3.secretKey } }) : undefined;
  return { async check() {
    const state: Record<string, "ok" | "unavailable" | "incomplete" | "misconfigured"> = { configuration: "ok" };
    const minioAbort = new AbortController();
    const probes: [string, Promise<unknown>, (() => void)?][] = [
      ["postgresql", options.database.readiness()],
      ["redis", options.redisUrl ? redisPing(options.redisUrl, options.timeoutMs) : Promise.reject(new Error("not configured"))],
      ["minio", s3 && options.s3 ? s3.send(new HeadBucketCommand({ Bucket: options.s3.bucket }), { abortSignal: minioAbort.signal }) : Promise.reject(new Error("not configured")), () => minioAbort.abort()],
    ];
    await Promise.all(probes.map(async ([name, probe, abort]) => { try { await deadline(probe, options.timeoutMs, abort); state[name] = "ok"; } catch (error) { state[name] = error instanceof Error && error.message.startsWith("migration_") ? "incomplete" : "unavailable"; } }));
    return state;
  }};
}
