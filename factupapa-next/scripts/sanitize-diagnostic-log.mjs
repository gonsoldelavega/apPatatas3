import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath, envPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !envPath) {
  throw new Error("usage: sanitize-diagnostic-log <input> <output> <env>");
}

const sensitiveNames = new Set([
  "POSTGRES_PASSWORD",
  "API_DATABASE_PASSWORD",
  "REDIS_PASSWORD",
  "MINIO_ROOT_PASSWORD",
  "S3_SECRET_KEY",
  "JWT_SECRET",
  "INTERNAL_METRICS_TOKEN",
]);

const env = await readFile(envPath, "utf8");
const secrets = env
  .split(/\r?\n/u)
  .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/u))
  .filter((match) => match && sensitiveNames.has(match[1]))
  .map((match) => match[2])
  .filter((value) => value.length >= 8)
  .sort((left, right) => right.length - left.length);

let contents = await readFile(inputPath, "utf8");
for (const secret of secrets) contents = contents.replaceAll(secret, "[redacted]");

contents = contents
  .replace(/(authorization["']?\s*[:=]\s*["']?)[^\s,"'}]+/giu, "$1[redacted]")
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
  .replace(/(factupapa_refresh=)[^;\s"']+/giu, "$1[redacted]")
  .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+@/giu, "$1[redacted]@")
  .replace(/authorization/giu, "redacted-header")
  .replace(/(?:accessToken|refreshToken|password)/giu, "redacted-field")
  .replace(/[\r\n]+$/u, "\n");

await writeFile(outputPath, contents, { mode: 0o600 });
