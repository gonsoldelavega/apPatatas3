import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

const require = createRequire(import.meta.url);
const tessdata = join(process.env.TMPDIR ?? "/tmp", "factupapa-tessdata-v1");
let workerPromise: Promise<Worker> | undefined;
let queue = Promise.resolve();

async function languageData() {
  await mkdir(tessdata, { recursive: true, mode: 0o700 });
  for (const language of ["spa", "eng"] as const) {
    const source = require.resolve(`@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`);
    await copyFile(source, join(tessdata, `${language}.traineddata.gz`));
  }
  return tessdata;
}

async function worker() {
  if (!workerPromise) {
    workerPromise = languageData().then(async (langPath) => {
      const instance = await createWorker(["spa", "eng"], OEM.LSTM_ONLY, {
        langPath,
        cachePath: join(dirname(langPath), "factupapa-tesseract-cache"),
        gzip: true,
        logger: () => undefined,
      });
      await instance.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      return instance;
    });
  }
  return workerPromise;
}

async function preparedImage(input: Buffer) {
  return sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2200, height: 3000, fit: "inside", withoutEnlargement: false })
    .flatten({ background: "white" })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1 })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export interface OcrPageResult {
  text: string;
  confidence: number;
}

export function recognizeDocumentPage(input: Buffer): Promise<OcrPageResult> {
  const task = queue.then(async () => {
    const image = await preparedImage(input);
    const result = await (await worker()).recognize(image);
    return {
      text: result.data.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 100_000),
      confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))),
    };
  });
  queue = task.then(() => undefined, () => undefined);
  return task;
}

export async function recognizeWithTimeout(input: Buffer, timeoutMs = 45_000) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      recognizeDocumentPage(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("ocr_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function closeOcrWorker() {
  const active = workerPromise;
  workerPromise = undefined;
  if (active) await (await active).terminate();
}
