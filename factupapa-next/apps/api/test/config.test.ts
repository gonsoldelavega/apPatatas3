import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

test("la configuración exige DATABASE_URL", () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL es obligatoria/);
});

test("la configuración rechaza puertos no válidos", () => {
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgresql://localhost/test",
        JWT_SECRET: "x".repeat(32),
        APP_PORT: "70000",
      }),
    /APP_PORT debe ser un puerto válido/,
  );
});

test("la configuración aplica valores predeterminados seguros", () => {
  assert.deepEqual(
    loadConfig({
      DATABASE_URL: "postgresql://localhost/test",
      JWT_SECRET: "x".repeat(32),
    }),
    {
      host: "0.0.0.0",
      port: 4100,
      databaseUrl: "postgresql://localhost/test",
      appVersion: "development",
      jwtSecret: "x".repeat(32),
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 30,
      loginRateLimitMax: 5,
      loginRateLimitWindowMs: 60_000,
      importMaximumBytes: 1_048_576,
      importMaximumRows: 1_000,
      importPreviewRows: 50,
      corsAllowedOrigins: [],
      authCookieSecure: false,
      authCookieName: "factupapa_refresh",
    },
  );
});

test("la configuración acepta únicamente orígenes CORS exactos", () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "x".repeat(32),
    CORS_ALLOWED_ORIGINS:
      "http://127.0.0.1:5173,https://app.example.test,http://127.0.0.1:5173",
  });
  assert.deepEqual(config.corsAllowedOrigins, [
    "http://127.0.0.1:5173",
    "https://app.example.test",
  ]);
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgresql://localhost/test",
        JWT_SECRET: "x".repeat(32),
        CORS_ALLOWED_ORIGINS: "*",
      }),
    /orígenes HTTP/,
  );
});

test("la configuración rechaza nombres de cookie capaces de inyectar cabeceras", () => {
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgresql://localhost/test",
        JWT_SECRET: "x".repeat(32),
        AUTH_COOKIE_NAME: "refresh; Path=/",
      }),
    /AUTH_COOKIE_NAME/,
  );
});

test("la configuración exige cookie Secure en producción", () => {
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgresql://localhost/test",
        JWT_SECRET: "x".repeat(32),
        APP_ENV: "production",
        AUTH_COOKIE_SECURE: "false",
      }),
    /AUTH_COOKIE_SECURE/,
  );
});

test("la configuración rechaza un secreto JWT débil", () => {
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgresql://localhost/test",
        JWT_SECRET: "short",
      }),
    /JWT_SECRET debe tener al menos 32 bytes/,
  );
});
