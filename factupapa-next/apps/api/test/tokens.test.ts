import assert from "node:assert/strict";
import { test } from "node:test";
import { createRefreshToken, hashRefreshToken, TokenService } from "../src/auth/tokens.js";

test("el access token firmado conserva la identidad mínima", async () => {
  const service = new TokenService("test-secret-with-at-least-32-bytes-long", 900);
  const identity = {
    userId: "d632f7e5-e108-40cb-9c97-5100d8ef55da",
    companyId: "398f1da7-486b-4dd6-9aa3-5cc84794d28e",
    familyId: "b8e79019-c557-479f-8880-f4c61727355a",
    role: "owner",
  };
  const result = await service.createAccessToken(identity);
  assert.equal(result.expiresIn, 900);
  assert.deepEqual(await service.verifyAccessToken(result.token), identity);
});

test("los refresh tokens son aleatorios y solo se conserva un hash", () => {
  const first = createRefreshToken();
  const second = createRefreshToken();
  assert.match(first, /^fp_rt_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashRefreshToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashRefreshToken(first).includes(first), false);
});
