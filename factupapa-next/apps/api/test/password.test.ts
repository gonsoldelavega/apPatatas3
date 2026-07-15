import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

test("las contraseñas se almacenan y verifican con Argon2id", async () => {
  const password = "correct-horse-battery-staple";
  const passwordHash = await hashPassword(password);
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(passwordHash, password), true);
  assert.equal(
    await verifyPassword(passwordHash, "wrong-password-value"),
    false,
  );
  assert.equal(passwordHash.includes(password), false);
});
