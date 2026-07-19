import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashFictitiousSeedPassword,
  hashPassword,
  verifyPassword,
} from "../src/auth/password.js";

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

test("el PIN corto solo se admite para el seed ficticio", async () => {
  await assert.rejects(() => hashPassword("123456"), /14 y 128/);
  const passwordHash = await hashFictitiousSeedPassword("123456");
  assert.equal(await verifyPassword(passwordHash, "123456"), true);
  await assert.rejects(
    () => hashFictitiousSeedPassword("12345"),
    /6 y 128/,
  );
});
