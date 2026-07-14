import assert from "node:assert/strict";
import { test } from "node:test";
import { LoginRateLimiter } from "../src/auth/rate-limit.js";

test("el rate limit bloquea al superar la ventana y se recupera después", () => {
  let now = 1_000;
  const limiter = new LoginRateLimiter(2, 500, () => now);
  assert.equal(limiter.consume("client"), true);
  assert.equal(limiter.consume("client"), true);
  assert.equal(limiter.consume("client"), false);
  now += 500;
  assert.equal(limiter.consume("client"), true);
});
