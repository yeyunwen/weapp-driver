#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdin as input } from "node:process";
import { spawn } from "node:child_process";

import { WeAppDriverDaemon } from "./daemon.js";
import { connectToDaemon } from "./daemon-client.js";
import { executeScript } from "./script-runner.js";
import { defaultSocketPath } from "./util.js";

const HELP = `weapp

Agent-first batch automation for WeChat Mini Programs.

Usage:
  weapp nodejs [--project /absolute/project] < script.js
  weapp run path/to/script.js [--project /absolute/project]
  weapp smoke --project /absolute/project [--route /pages/index/index] [--screenshot /tmp/result.png]
  weapp --version
  weapp sessions
  weapp stop
  weapp doctor
  weapp daemon [--socket /tmp/weapp-driver.sock]

Environment:
  WEAPP_DRIVER_SOCKET     Override the daemon Unix socket.
  WEAPP_PROJECT           Default project for nodejs/run.
`;

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function main() {
  const [command = "help", ...argv] = process.argv.slice(2);
  if (["help", "-h", "--help"].includes(command)) {
    process.stdout.write(HELP);
    return;
  }
  if (["version", "-v", "--version"].includes(command)) {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    process.stdout.write(`${packageJson.version || "unknown"}\n`);
    return;
  }
  const socketPath = valueAfter(argv, "--socket") || defaultSocketPath();
  if (command === "daemon") {
    const daemon = new WeAppDriverDaemon(socketPath);
    await daemon.start();
    const shutdown = async () => {
      await daemon.stop();
      process.exit(0);
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    return new Promise(() => undefined);
  }
  if (command === "doctor") {
    const client = await connectToDaemon(socketPath);
    const daemon = await client.call("ping");
    client.close();
    const wechatide = await commandOutput("wechatide", []);
    process.stdout.write(`${JSON.stringify({ node: process.version, daemon, wechatide: wechatide.split(/\r?\n/)[0] }, null, 2)}\n`);
    return;
  }
  if (command === "sessions") {
    const client = await connectToDaemon(socketPath);
    const sessions = await client.call("session.list");
    client.close();
    process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
    return;
  }
  if (command === "stop") {
    const client = await connectToDaemon(socketPath, { autostart: false });
    const daemon = await client.call<{ pid: number }>("ping");
    client.close();
    process.kill(daemon.pid, "SIGTERM");
    process.stdout.write(`Stopped weapp-driver daemon ${daemon.pid}\n`);
    return;
  }
  if (command === "smoke") {
    const project = valueAfter(argv, "--project") || process.env.WEAPP_PROJECT;
    if (!project) throw new Error("weapp smoke requires --project or WEAPP_PROJECT");
    const route = valueAfter(argv, "--route");
    const screenshotPath = valueAfter(argv, "--screenshot");
    const client = await connectToDaemon(socketPath);
    try {
      await executeScript(
        `
${route ? `await mini.reLaunch(${JSON.stringify(route)});` : ""}
const info = await mini.info();
const snapshot = await page.snapshot({ includeLayout: true });
const errors = await logs.errors();
const screenshot = await page.screenshot(${JSON.stringify(screenshotPath)});
test.check("runtime connected", Boolean(info), info);
test.check("page snapshot captured", typeof snapshot === "string" && snapshot.length > 0, { length: snapshot.length });
test.check("no buffered runtime errors", errors.length === 0, errors);
test.check("screenshot captured", Boolean(screenshot), screenshot);
console.log(JSON.stringify(test.report({ info, snapshot, errors, screenshot }), null, 2));
`,
        client,
        project,
      );
    } finally {
      client.close();
    }
    return;
  }
  if (command === "nodejs" || command === "run") {
    const project = valueAfter(argv, "--project") || process.env.WEAPP_PROJECT;
    const code = command === "nodejs" ? await readStdin() : await readFile(requiredScript(argv), "utf8");
    if (!code.trim()) throw new Error("No JavaScript was provided");
    const client = await connectToDaemon(socketPath);
    try {
      await executeScript(code, client, project);
    } finally {
      client.close();
    }
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function requiredScript(argv: string[]) {
  const path = argv.find((arg) => !arg.startsWith("--") && arg !== valueAfter(argv, "--project") && arg !== valueAfter(argv, "--socket"));
  if (!path) throw new Error("weapp run requires a script path");
  return path;
}

function valueAfter(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function readStdin() {
  input.setEncoding("utf8");
  let value = "";
  for await (const chunk of input) value += chunk;
  return value;
}

function commandOutput(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr || `${command} exited with ${code}`))));
  });
}
