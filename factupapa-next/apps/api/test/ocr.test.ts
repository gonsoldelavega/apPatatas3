import assert from "node:assert/strict";
import { after, test } from "node:test";
import sharp from "sharp";
import { closeOcrWorker, recognizeWithTimeout } from "../src/finance/ocr.js";

after(async () => closeOcrWorker());

test("reconoce una factura ficticia en español sin servicios externos", async () => {
  const image = await sharp({
    create: { width: 1400, height: 900, channels: 3, background: "white" },
  })
    .composite([
      {
        input: Buffer.from(`
          <svg width="1400" height="900" xmlns="http://www.w3.org/2000/svg">
            <style>text { font-family: sans-serif; fill: #111; }</style>
            <text x="80" y="120" font-size="64" font-weight="bold">FACTURA F-2026-128</text>
            <text x="80" y="230" font-size="46">Proveedor ficticio S.L.</text>
            <text x="80" y="310" font-size="46">NIF B12345678</text>
            <text x="80" y="390" font-size="46">Fecha de emisión: 15/07/2026</text>
            <text x="80" y="560" font-size="54">Base imponible 100,00 EUR</text>
            <text x="80" y="640" font-size="54">IVA 4% 4,00 EUR</text>
            <text x="80" y="740" font-size="68" font-weight="bold">TOTAL FACTURA 104,00 EUR</text>
          </svg>`),
      },
    ])
    .png()
    .toBuffer();
  const result = await recognizeWithTimeout(image, 60_000);
  assert.match(result.text, /F-2026-128/);
  assert.match(result.text, /B12345678/);
  assert.match(result.text, /104,00/);
  assert.ok(result.confidence >= 60);
});
