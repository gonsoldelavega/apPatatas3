#!/usr/bin/env node
/**
 * Private, one-at-a-time staging task runner.
 *
 * Tasks are deliberately operational only. Feature work remains on the normal
 * development branch and production is not an addressable environment here.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const taskPath = resolve(root, ".factupapa-control/task.json");
const resultDirectory = resolve(root, ".factupapa-control/results");
const maxInstructionLength = 12_000;
const taskIdPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function taskError(message) {
  const error = new Error(message);
  error.code = "invalid_task";
  return error;
}

function validateTask(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw taskError("task_must_be_an_object");
  const task = candidate;
  if (task.version !== 1) throw taskError("unsupported_task_version");
  if (!taskIdPattern.test(safeString(task.id))) throw taskError("invalid_task_id");
  if (task.environment !== "staging") throw taskError("only_staging_is_addressable");
  if (!["inspect", "apply"].includes(task.operation)) throw taskError("invalid_operation");
  if (typeof task.enabled !== "boolean") throw taskError("enabled_must_be_boolean");
  if (task.operation === "apply" && task.authorization !== "user-confirmed") {
    throw taskError("staging_apply_requires_user_confirmed_authorization");
  }
  const instructions = safeString(task.instructions);
  if (!instructions || instructions.length > maxInstructionLength) throw taskError("invalid_instruction_length");
  const productionInstruction = instructions
    .split(/[.\n]/)
    .some((sentence) => /\b(production|produccion|producción)\b/i.test(sentence) && !/\b(no|nunca|sin|never|do not)\b/i.test(sentence));
  if (productionInstruction) {
    throw taskError("production_is_not_addressable_from_control_plane");
  }
  return { ...task, instructions };
}

function run(command, args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolveRun({ code: 127, stdout, stderr: `${stderr}${error.message}`, timedOut: false }));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveRun({ code: code ?? 1, stdout, stderr, timedOut: signal === "SIGTERM" });
    });
  });
}

function sanitize(text, max = 10_000) {
  return text
    .replace(/(?:ghp_|github_pat_|sk-[A-Za-z0-9_-]+|Bearer\s+)[A-Za-z0-9._-]+/g, "[REDACTED]")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim()
    .slice(-max);
}

async function main() {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  let rawTask = null;
  let task = null;
  let result;
  try {
    if (!existsSync(taskPath)) throw taskError("task_file_missing");
    rawTask = JSON.parse(await readFile(taskPath, "utf8"));
    task = validateTask(rawTask);
    const taskHash = createHash("sha256").update(JSON.stringify(task)).digest("hex");
    if (!task.enabled) {
      result = { status: "idle", reason: "task_disabled", taskHash };
    } else {
      const policy = [
        "You are the FactuPapa private staging operations agent.",
        "This is an isolated rootless staging host only.",
        "Never access production, main, n8n, FactuPapa antigua, or credentials.",
        "Do not alter repository source code from this task runner.",
        "For apply tasks: create a verified PostgreSQL backup, run a transactional dry-run, apply only if the dry-run passes, then run the same dry-run again to prove idempotency.",
        "Stop on ambiguity or any discrepancy outside the stated scope. Return concise evidence with no secrets.",
        `Operation: ${task.operation}.`,
        `User-confirmed authorization: ${task.authorization === "user-confirmed" ? "yes" : "no"}.`,
        "Task:",
        task.instructions,
      ].join("\n");
      // Staging commands need the rootless Docker socket. This runner is a
      // dedicated VPS account and the task schema permanently excludes production.
      const execution = await run("codex", ["exec", "--ephemeral", "--sandbox", "danger-full-access", policy], 45 * 60 * 1000);
      result = {
        status: execution.code === 0 && !execution.timedOut ? "completed" : "failed",
        exitCode: execution.code,
        timedOut: execution.timedOut,
        message: sanitize(execution.stdout || execution.stderr),
        diagnostics: execution.code === 0 ? undefined : sanitize(execution.stderr, 3_000),
        taskHash,
      };
    }
  } catch (error) {
    result = { status: "rejected", reason: error instanceof Error ? error.message : "control_plane_error" };
  }

  const taskId = task?.id ?? (safeString(rawTask?.id) || `invalid-${runId}`);
  await mkdir(resultDirectory, { recursive: true });
  await writeFile(resolve(resultDirectory, `${taskId}.json`), `${JSON.stringify({ runId, taskId, startedAt, finishedAt: new Date().toISOString(), ...result }, null, 2)}\n`, { mode: 0o600 });
  if (result.status !== "idle" && rawTask && typeof rawTask === "object" && !Array.isArray(rawTask)) {
    rawTask.enabled = false;
    rawTask.lastRunId = runId;
    rawTask.lastResult = result.status;
    await writeFile(taskPath, `${JSON.stringify(rawTask, null, 2)}\n`, { mode: 0o600 });
  }
  if (result.status === "failed" || result.status === "rejected") process.exitCode = 1;
}

await main();
