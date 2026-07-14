export interface AppConfig {
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
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? "4100");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("APP_PORT debe ser un puerto válido entre 1 y 65535");
  }
  return port;
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

function readCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const origins = [...new Set(value.split(",").map((origin) => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS debe contener orígenes HTTP(S) exactos separados por comas");
    }
    if (origin === "*" || (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) {
      throw new Error("CORS_ALLOWED_ORIGINS debe contener orígenes HTTP(S) exactos separados por comas");
    }
  }
  return origins;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es obligatoria");
  }
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes");
  }

  return {
    host: env.APP_HOST ?? "0.0.0.0",
    port: readPort(env.APP_PORT),
    databaseUrl,
    appVersion: env.APP_VERSION ?? "development",
    jwtSecret,
    accessTokenTtlSeconds: readPositiveInteger("ACCESS_TOKEN_TTL_SECONDS", env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtlDays: readPositiveInteger("REFRESH_TOKEN_TTL_DAYS", env.REFRESH_TOKEN_TTL_DAYS, 30),
    loginRateLimitMax: readPositiveInteger("LOGIN_RATE_LIMIT_MAX", env.LOGIN_RATE_LIMIT_MAX, 5),
    loginRateLimitWindowMs: readPositiveInteger("LOGIN_RATE_LIMIT_WINDOW_MS", env.LOGIN_RATE_LIMIT_WINDOW_MS, 60_000),
    importMaximumBytes: readPositiveInteger("IMPORT_MAX_BYTES", env.IMPORT_MAX_BYTES, 1_048_576),
    importMaximumRows: readPositiveInteger("IMPORT_MAX_ROWS", env.IMPORT_MAX_ROWS, 1_000),
    importPreviewRows: readPositiveInteger("IMPORT_PREVIEW_ROWS", env.IMPORT_PREVIEW_ROWS, 50),
    corsAllowedOrigins: readCorsOrigins(env.CORS_ALLOWED_ORIGINS),
  };
}
