import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import type { WechatideCall } from "./types.js";
import { tryParseJson } from "./util.js";

export async function callWechatide(call: WechatideCall) {
  const temp = await mkdtemp(join(tmpdir(), "weapp-driver-wechatide-"));
  try {
    const args = ["-c", call.clientName || "WeAppDriver", call.tool];
    for (const [key, value] of Object.entries(call.args || {})) {
      if (value === undefined || value === null || value === false) continue;
      const flag = `--${toKebabCase(key)}`;
      if (value === true) {
        args.push(flag);
      } else if (typeof value === "object") {
        const path = join(temp, `${toKebabCase(key)}.json`);
        await writeFile(path, JSON.stringify(value, null, 2));
        args.push(`${flag}-file`, path);
      } else {
        args.push(flag, String(value));
      }
    }
    if (call.token) args.push("--token", call.token);
    const output = await run("wechatide", args, call.timeoutMs ?? 60_000);
    return tryParseJson(output);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`).replace(/_/g, "-");
}

function run(command: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`wechatide timed out after ${timeoutMs}ms: ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `wechatide exited with code ${code}`));
    });
  });
}
