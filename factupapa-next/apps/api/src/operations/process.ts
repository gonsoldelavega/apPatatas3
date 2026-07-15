import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";

export function run(command: string, args: string[], options: { cwd?: string; stdinFile?: string; stdoutFile?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: [options.stdinFile ? "pipe" : "ignore", options.stdoutFile ? "pipe" : "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk) => options.stdoutFile ? undefined : stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    let output: ReturnType<typeof createWriteStream> | undefined;
    let outputFinished: Promise<void> = Promise.resolve();
    let outputError: Error | undefined;
    if (options.stdoutFile && child.stdout) {
      output = createWriteStream(options.stdoutFile, { mode: 0o600 });
      outputFinished = new Promise((finish) => { output!.once("close", finish); output!.once("error", (error) => { outputError = error; finish(); }); });
      child.stdout.pipe(output);
    }
    if (options.stdinFile && child.stdin) {
      const input = createReadStream(options.stdinFile);
      input.once("error", (error) => { child.kill(); reject(error); });
      input.pipe(child.stdin);
    }
    child.once("error", reject);
    child.once("close", async (code) => {
      const finish = () => code === 0 ? resolve(Buffer.concat(stdout).toString("utf8")) : reject(new Error(Buffer.concat(stderr).toString("utf8").replace(/postgresql:\/\/[^\s@]+@/g, "postgresql://[redacted]@").replace(/[\r\n]+/g, " ").slice(0, 500) || `${command} failed`));
      await outputFinished;
      if (outputError) reject(outputError); else finish();
    });
  });
}
