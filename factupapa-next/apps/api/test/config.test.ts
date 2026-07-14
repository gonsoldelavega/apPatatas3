import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

test("la configuración exige DATABASE_URL", () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL es obligatoria/);
});

test("la configuración rechaza puertos no válidos", () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: "postgresql://localhost/test", JWT_SECRET: "x".repeat(32), APP_PORT: "70000" }),
    /APP_PORT debe ser un puerto válido/,
  );
});

test("la configuración aplica valores predeterminados seguros", () => {
  assert.deepEqual(loadConfig({ DATABASE_URL: "postgresql://localhost/test", JWT_SECRET: "x".repeat(32) }), {
    host: "0.0.0.0",
    port: 4100,
    databaseUrl: "postgresql://localhost/test",
    appVersion: "development",
    jwtSecret: "x".repeat(32),
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    loginRateLimitMax: 5,
    loginRateLimitWindowMs: 60_000,
  });
});

test("la configuración rechaza un secreto JWT débil", () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: "postgresql://localhost/test", JWT_SECRET: "short" }),
    /JWT_SECRET debe tener al menos 32 bytes/,
  );
});
