import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OCR_ATTEMPT_RESERVATION_MICROUSD,
  haiku45CostMicrousd,
} from "../src/finance/ocr-budget.js";

test("calcula el coste conservador de Haiku 4.5 en microdólares", () => {
  assert.equal(
    haiku45CostMicrousd({ inputTokens: 3_136, outputTokens: 500 }),
    5_636,
  );
  assert.ok(OCR_ATTEMPT_RESERVATION_MICROUSD >= 60_240);
});
