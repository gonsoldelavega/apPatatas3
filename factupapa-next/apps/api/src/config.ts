export interface AppConfig {
  environment: "development" | "integration" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  appVersion: string;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  importMaximumBytes: number;
  importMaximumRows: number;
  importPreviewRows: number;
  corsAllowedOrigins: string[];
  authCookieSecure: boolean;
  authCookieName: string;
  redisUrl?: string;
  s3Endpoint?: string;
  s3Bucket: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  internalMetricsToken?: string;
  internalMetricsAllowRemote: boolean;
  dependencyTimeoutMs: number;
  importRetentionDays: { completed: number; cancelled: number; failed: number };
  importCleanupLimit: number;
  anthropicApiKey?: string;
  ownTaxIds: string[];
}

const placeholder = /^(changeme|change_me|password|secret|default|cambiar(?:_|$)|minioadmin)/i;

function rejectPlaceholder(name: string, value: string | undefined): void {
  if (value && placeholder.test(value)) throw new Error(`${name} contiene un valor placeholder o predeterminado`);
}

function readBoolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} debe ser true o false`);
}

function readCookieName(value: string | undefined): string {
  const name = value?.trim() || "factupapa_refresh";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name))
    throw new Error("AUTH_COOKIE_NAME no es válido");
  return name;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? "4100");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("APP_PORT debe ser un puerto válido entre 1 y 65535");
  }
  return port;
}

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

function readCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const origins = [
    ...new Set(
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        "CORS_ALLOWED_ORIGINS debe contener orígenes HTTP(S) exactos separados por comas",
      );
    }
    if (
      origin === "*" ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin !== origin
    ) {
      throw new Error(
        "CORS_ALLOWED_ORIGINS debe contener orígenes HTTP(S) exactos separados por comas",
      );
    }
  }
  return origins;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = env.APP_ENV ?? "development";
  if (environment !== "development" && environment !== "integration" && environment !== "production") throw new Error("APP_ENV debe ser development, integration o production");
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es obligatoria");
  }
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes");
  }
  rejectPlaceholder("JWT_SECRET", jwtSecret);
  rejectPlaceholder("DATABASE_URL", (() => { try { return new URL(databaseUrl).password; } catch { throw new Error("DATABASE_URL no es una URL PostgreSQL válida"); } })());
  const database = new URL(databaseUrl);
  if (database.protocol !== "postgresql:" && database.protocol !== "postgres:") throw new Error("DATABASE_URL debe usar PostgreSQL");
  if (env.DATABASE_ADMIN_URL) {
    const admin = new URL(env.DATABASE_ADMIN_URL);
    if (admin.username && admin.username === database.username) throw new Error("El rol API no puede ser igual al migrador");
  }
  const authCookieSecure = readBoolean(
    "AUTH_COOKIE_SECURE",
    env.AUTH_COOKIE_SECURE,
    false,
  );
  if (environment === "production" && !authCookieSecure) {
    throw new Error("AUTH_COOKIE_SECURE debe ser true en producción");
  }
  for (const [name, value] of [["REDIS_URL", env.REDIS_URL], ["S3_ACCESS_KEY", env.S3_ACCESS_KEY], ["S3_SECRET_KEY", env.S3_SECRET_KEY], ["MINIO_ROOT_USER", env.MINIO_ROOT_USER], ["MINIO_ROOT_PASSWORD", env.MINIO_ROOT_PASSWORD]] as const) rejectPlaceholder(name, value);
  rejectPlaceholder("INTERNAL_METRICS_TOKEN", env.INTERNAL_METRICS_TOKEN);
  rejectPlaceholder("ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY);
  if (env.REDIS_URL) {
    const redis = new URL(env.REDIS_URL);
    if (redis.protocol !== "redis:" && redis.protocol !== "rediss:") throw new Error("REDIS_URL debe usar Redis");
    rejectPlaceholder("REDIS_PASSWORD", decodeURIComponent(redis.password));
  }
  if (env.S3_ENDPOINT) {
    const endpoint = new URL(env.S3_ENDPOINT);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("S3_ENDPOINT debe ser HTTP(S)");
  }
  const operationalDependencies = [env.REDIS_URL, env.S3_ENDPOINT, env.S3_ACCESS_KEY, env.S3_SECRET_KEY];
  if (environment !== "development" && operationalDependencies.some((value) => !value)) throw new Error("Redis y MinIO son obligatorios fuera de desarrollo");
  if (env.INTERNAL_METRICS_ALLOW_REMOTE === "true" && (!env.INTERNAL_METRICS_TOKEN || Buffer.byteLength(env.INTERNAL_METRICS_TOKEN) < 32)) throw new Error("INTERNAL_METRICS_TOKEN fuerte es obligatorio para acceso remoto");
  if (environment === "production" && env.INTERNAL_METRICS_ALLOW_REMOTE === "true") throw new Error("Las métricas internas no pueden exponerse externamente en producción");
  const corsAllowedOrigins = readCorsOrigins(env.CORS_ALLOWED_ORIGINS);
  if (environment === "production" && corsAllowedOrigins.length === 0) throw new Error("CORS_ALLOWED_ORIGINS es obligatoria en producción");
  const s3Bucket = env.S3_BUCKET?.trim() || "factupapa-documents";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3Bucket)) throw new Error("S3_BUCKET no es válido");

  return {
    environment,
    host: env.APP_HOST ?? "0.0.0.0",
    port: readPort(env.APP_PORT),
    databaseUrl,
    appVersion: env.APP_VERSION ?? "development",
    jwtSecret,
    accessTokenTtlSeconds: readPositiveInteger(
      "ACCESS_TOKEN_TTL_SECONDS",
      env.ACCESS_TOKEN_TTL_SECONDS,
      900,
    ),
    refreshTokenTtlDays: readPositiveInteger(
      "REFRESH_TOKEN_TTL_DAYS",
      env.REFRESH_TOKEN_TTL_DAYS,
      30,
    ),
    loginRateLimitMax: readPositiveInteger(
      "LOGIN_RATE_LIMIT_MAX",
      env.LOGIN_RATE_LIMIT_MAX,
      5,
    ),
    loginRateLimitWindowMs: readPositiveInteger(
      "LOGIN_RATE_LIMIT_WINDOW_MS",
      env.LOGIN_RATE_LIMIT_WINDOW_MS,
      60_000,
    ),
    importMaximumBytes: readPositiveInteger(
      "IMPORT_MAX_BYTES",
      env.IMPORT_MAX_BYTES,
      1_048_576,
    ),
    importMaximumRows: readPositiveInteger(
      "IMPORT_MAX_ROWS",
      env.IMPORT_MAX_ROWS,
      1_000,
    ),
    importPreviewRows: readPositiveInteger(
      "IMPORT_PREVIEW_ROWS",
      env.IMPORT_PREVIEW_ROWS,
      50,
    ),
    corsAllowedOrigins,
    authCookieSecure,
    authCookieName: readCookieName(env.AUTH_COOKIE_NAME),
    ...(env.REDIS_URL ? { redisUrl: env.REDIS_URL } : {}),
    ...(env.S3_ENDPOINT ? { s3Endpoint: env.S3_ENDPOINT } : {}),
    s3Bucket,
    ...(env.S3_ACCESS_KEY ? { s3AccessKey: env.S3_ACCESS_KEY } : {}),
    ...(env.S3_SECRET_KEY ? { s3SecretKey: env.S3_SECRET_KEY } : {}),
    ...(env.INTERNAL_METRICS_TOKEN ? { internalMetricsToken: env.INTERNAL_METRICS_TOKEN } : {}),
    internalMetricsAllowRemote: readBoolean("INTERNAL_METRICS_ALLOW_REMOTE", env.INTERNAL_METRICS_ALLOW_REMOTE, false),
    dependencyTimeoutMs: readPositiveInteger("DEPENDENCY_TIMEOUT_MS", env.DEPENDENCY_TIMEOUT_MS, 2_000),
    importRetentionDays: {
      completed: readPositiveInteger("IMPORT_RETENTION_COMPLETED_DAYS", env.IMPORT_RETENTION_COMPLETED_DAYS, 30),
      cancelled: readPositiveInteger("IMPORT_RETENTION_CANCELLED_DAYS", env.IMPORT_RETENTION_CANCELLED_DAYS, 7),
      failed: readPositiveInteger("IMPORT_RETENTION_FAILED_DAYS", env.IMPORT_RETENTION_FAILED_DAYS, 14),
    },
    importCleanupLimit: readPositiveInteger("IMPORT_CLEANUP_LIMIT", env.IMPORT_CLEANUP_LIMIT, 500),
    ...(env.ANTHROPIC_API_KEY?.trim()
      ? { anthropicApiKey: env.ANTHROPIC_API_KEY.trim() }
      : {}),
    ownTaxIds: [
      ...new Set(
        (env.OWN_TAX_IDS ?? "45313973V")
          .split(",")
          .map((value) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter(Boolean),
      ),
    ],
  };
}

export function publicConfigSummary(config: AppConfig) {
  return {
    environment: config.environment,
    database: "configured",
    redis: config.redisUrl ? "configured" : "disabled",
    objectStorage: config.s3Endpoint ? "configured" : "disabled",
    metrics: config.internalMetricsToken ? "protected" : "local_only",
    visionExtraction: config.anthropicApiKey ? "configured" : "disabled",
  };
}
