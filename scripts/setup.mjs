import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await run("bun", ["link"], repository);
await run(process.execPath, ["scripts/install-skill.mjs", "--target", "codex"], repository);

process.stdout.write(
  [
    "weapp-driver is ready.",
    `CLI: ${await resolveCommand("weapp")}`,
    "Next: weapp doctor",
    "Codex discovers the Skill on the next turn. Invoke it explicitly with $weapp-driver if desired.",
  ].join("\n") + "\n",
);

async function resolveCommand(command) {
  return new Promise((resolvePromise) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (output += chunk));
    child.once("close", () => resolvePromise(output.trim() || command));
  });
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`))));
  });
}
