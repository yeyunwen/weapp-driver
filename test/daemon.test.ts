import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WeAppDriverDaemon } from "../src/daemon.js";
import { RpcClient } from "../src/rpc-client.js";
import { executeScript } from "../src/script-runner.js";
import { FakeBackendFactory } from "./fakes.js";

test("daemon supports a complete batch automation flow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "weapp-driver-e2e-"));
  const project = join(directory, "project");
  const socket = join(directory, "daemon.sock");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(project));
  const factory = new FakeBackendFactory();
  const daemon = new WeAppDriverDaemon(socket, factory);
  await daemon.start();
  const client = new RpcClient(socket, "test-client");
  const output: unknown[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => output.push(...args);
  try {
    await executeScript(
      `
      await useProject(${JSON.stringify(project)})
      const snap = await page.snapshot({ includeLayout: true })
      await page.click('@1')
      await page.fill('@2', 'reason')
      await mini.reLaunch('/pages/result/index')
      await page.waitForRoute('pages/result/index')
      console.log({ snap, info: await mini.info(), errors: await logs.errors() })
      `,
      client,
    );
    const backend = factory.backends.get(project);
    assert.equal(backend?.page.elements[0]?.tapped, 1);
    assert.equal(backend?.page.elements[1]?.valueState, "reason");
    assert.equal(backend?.page.path, "pages/result/index");
    assert.equal(output.length, 1);
    assert.match(JSON.stringify(output[0]), /@1 button/);
  } finally {
    console.log = originalLog;
    client.close();
    await daemon.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
