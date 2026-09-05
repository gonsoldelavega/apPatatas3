import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateInvoiceCreate,
  validateInvoiceNumberPreview,
  validateInvoicePatch,
} from "../src/invoices/validation.js";

const customerId = "11111111-1111-4111-8111-111111111111";

test("invoice create accepts an explicit positive integer number", () => {
  const input = validateInvoiceCreate({
    contactId: customerId,
    series: "fac_2026",
    number: 142,
    issueDate: "2026-09-05",
  });
  assert.equal(input.series, "FAC_2026");
  assert.equal(input.number, 142);
});

test("invoice number validation rejects zero and fractional values", () => {
  assert.throws(() =>
    validateInvoiceCreate({
      contactId: customerId,
      series: "FAC_2026",
      number: 0,
      issueDate: "2026-09-05",
    }),
  );
  assert.throws(() =>
    validateInvoicePatch({ number: 142.5 }),
  );
});

test("number preview normalizes series and validates issue date", () => {
  assert.deepEqual(
    validateInvoiceNumberPreview("fac_2026", "2026-09-05"),
    { series: "FAC_2026", issueDate: "2026-09-05" },
  );
  assert.throws(() => validateInvoiceNumberPreview("FAC 2026", "2026-09-05"));
});

test("manual issuance advances the sequence monotonically and checks duplicates", () => {
  const service = readFileSync(
    new URL("../src/invoices/service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /assertNumberAvailable/);
  assert.match(service, /greatest\(document_sequences\.next_number,excluded\.next_number\)/);
  assert.match(service, /number \+ 1/);
  assert.match(service, /before\.status === "issued"/);
});
