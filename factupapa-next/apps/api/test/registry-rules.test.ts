import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionIdentity } from "../src/auth/repository.js";
import { createRegistryAutoSync, type RegistrySyncTarget } from "../src/finance/registry-auto-sync.js";
import { isGeneratedByNext, isSuspiciousRegistryRow, type RegistrySyncResult } from "../src/finance/service.js";

const row = (reviewed: string) => {
  const cells = Array.from({ length: 22 }, () => "");
  cells[20] = reviewed;
  return cells;
};

test("las filas que la propia app exportó al Registro no se vuelven a importar", () => {
  assert.equal(isGeneratedByNext(row("Generado automáticamente desde FactuPapa Next")), true);
  assert.equal(isGeneratedByNext(row("generado automaticamente desde factupapa next")), true);
  assert.equal(isGeneratedByNext(row("sí")), false);
  assert.equal(isGeneratedByNext(row("")), false);
});

test("número o proveedor que el lector confunde («EMITIDA», «Original») se marcan como dudosos", () => {
  assert.equal(isSuspiciousRegistryRow("EMITIDA", "Higienlab"), true);
  assert.equal(isSuspiciousRegistryRow("26F02369", "Original"), true);
  assert.equal(isSuspiciousRegistryRow(" copia ", "GAYCA"), true);
  assert.equal(isSuspiciousRegistryRow("006/0002.619", "FRUTAS Y PATATAS GAYCA, S.A."), false);
  assert.equal(isSuspiciousRegistryRow(null, "Solred"), false);
});

const target = (id: string): RegistrySyncTarget => ({ companyId: id, userId: `u-${id}`, email: `${id}@example.test`, displayName: id, companyName: id });
const ok: RegistrySyncResult = { fetched: 3, imported: 2, skipped: 1, drafts: 1, paid: 1, incomplete: [] };

test("importación automática: una pasada por empresa, anota el resultado y sigue si una falla", async () => {
  const recorded: unknown[] = [];
  const seen: string[] = [];
  const run = createRegistryAutoSync({
    targets: async () => [target("a"), target("b")],
    sync: async (identity: SessionIdentity) => {
      seen.push(identity.companyId);
      assert.equal(identity.role, "owner");
      if (identity.companyId === "a") throw new Error("hoja no disponible");
      return ok;
    },
    record: (result) => recorded.push(result),
    log: () => undefined,
  });
  await run();
  assert.deepEqual(seen, ["a", "b"]);
  assert.deepEqual(recorded, [{ error: "hoja no disponible" }, ok]);
});

test("importación automática: dos pasadas no se solapan", async () => {
  let active = 0;
  let maximum = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const run = createRegistryAutoSync({
    targets: async () => [target("a")],
    sync: async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await gate;
      active -= 1;
      return ok;
    },
    record: () => undefined,
    log: () => undefined,
  });
  const first = run();
  const second = run();
  release();
  await Promise.all([first, second]);
  assert.equal(maximum, 1);
});
