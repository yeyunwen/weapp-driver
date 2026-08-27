import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("cli reports the package version", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  const { stdout } = await execFileAsync(process.execPath, [
    new URL("../src/cli.js", import.meta.url).pathname,
    "--version",
  ]);

  assert.equal(stdout.trim(), packageJson.version);
});
