import { loadConfig, publicConfigSummary } from "./config.js";

try {
  const config = loadConfig();
  process.stdout.write(`${JSON.stringify({ status: "valid", ...publicConfigSummary(config) })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: "invalid", error: error instanceof Error ? error.message.replace(/[\r\n]/g, " ").slice(0, 240) : "invalid_configuration" })}\n`);
  process.exitCode = 1;
}
