// Comprobacion de sintaxis de todo el JS del proyecto (sin dependencias externas).
// Equivale a `node --check` sobre cada archivo de src/ y api/.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOTS = ["src", "api", "scripts", "sw.js"];

function collect(path, out) {
  let st;
  try { st = statSync(path); } catch { return; }
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) collect(join(path, entry), out);
  } else if (path.endsWith(".js") || path.endsWith(".mjs")) {
    out.push(path);
  }
}

const files = [];
for (const root of ROOTS) collect(root, files);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failed += 1;
    console.error(`SYNTAX FAIL: ${file}`);
    console.error(String(error.stderr || error.message).trim());
  }
}

if (failed) {
  console.error(`\n${failed} archivo(s) con errores de sintaxis.`);
  process.exit(1);
}
console.log(`OK: ${files.length} archivos sin errores de sintaxis.`);
