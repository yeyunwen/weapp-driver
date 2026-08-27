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
      const backendReady = await page.exists('#submit')
      const snap = await page.snapshot({ includeLayout: true })
      await page.click('@1')
      await page.fill('@2', 'reason')
      const inputProperty = await page.property('@2', 'value')
      await mini.reLaunch('/pages/result/index')
      await page.waitForRoute('pages/result/index')
      const nested = await component.query('#card', 'button')
      const before = await component.data('#card', 'showTopBar')
      const beforeProperty = await component.property('#card', 'showTopBar')
      const objectProperty = await component.property('#card', 'config')
      await component.setData('#card', { showTopBar: true })
      const refreshed = await component.callMethod('#card', 'refresh', [1])
      console.log({
        backendReady,
        buttonCount: await page.count('button'),
        missing: await page.query('missing'),
        nested,
        before,
        beforeProperty,
        objectProperty,
        inputProperty,
        after: await component.data('#card', 'showTopBar'),
        refreshed,
        snap,
        info: await mini.info(),
        errors: await logs.errors(),
      })
      `,
      client,
    );
    const backend = factory.backends.get(project);
    assert.equal(backend?.page.elements[0]?.tapped, 1);
    assert.equal(backend?.page.elements[1]?.valueState, "reason");
    assert.equal(backend?.page.path, "pages/result/index");
    assert.equal(output.length, 1);
    assert.match(JSON.stringify(output[0]), /@1 button/);
    assert.equal((output[0] as { backendReady: boolean }).backendReady, true);
    assert.equal((output[0] as { buttonCount: number }).buttonCount, 1);
    assert.deepEqual((output[0] as { missing: { refs: unknown[] } }).missing.refs, []);
    assert.equal((output[0] as { nested: { refs: unknown[] } }).nested.refs.length, 1);
    assert.equal((output[0] as { before: boolean }).before, false);
    assert.equal((output[0] as { beforeProperty: boolean }).beforeProperty, false);
    assert.deepEqual((output[0] as { objectProperty: unknown }).objectProperty, { enabled: true });
    assert.equal((output[0] as { inputProperty: string }).inputProperty, "reason");
    assert.equal((output[0] as { after: boolean }).after, true);
    assert.deepEqual((output[0] as { refreshed: { method: string; args: unknown[] } }).refreshed, {
      method: "refresh",
      args: [1],
      data: { showTopBar: true, config: { enabled: true } },
    });
  } finally {
    console.log = originalLog;
    client.close();
    await daemon.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
