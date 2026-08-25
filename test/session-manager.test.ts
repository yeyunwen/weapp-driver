import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "../src/session-manager.js";
import { FakeBackendFactory } from "./fakes.js";

test("session manager reuses connections and enforces ownership", async () => {
  const project = await mkdtemp(join(tmpdir(), "weapp-driver-project-"));
  const factory = new FakeBackendFactory();
  const manager = new SessionManager(factory);
  try {
    const first = await manager.use(project, {}, "a");
    assert.equal(first.ownership, "agent");
    manager.release(project, "a");
    await manager.use(project, {}, "b");
    assert.equal(factory.backends.size, 1);

    manager.handoff(project, "b");
    await assert.rejects(() => manager.use(project, {}, "c"), /user owns project session/);
    const claimed = await manager.use(project, {}, "c", true);
    assert.equal(claimed.ownership, "agent");

    const completed = await manager.complete(project, "c", false);
    assert.deepEqual(completed, { done: true, kept: false, projectPath: project });
    assert.equal(factory.backends.get(project)?.closed, true);
  } finally {
    await manager.closeAll();
    await rm(project, { recursive: true, force: true });
  }
});

test("session manager rejects concurrent clients", async () => {
  const project = await mkdtemp(join(tmpdir(), "weapp-driver-project-"));
  const manager = new SessionManager(new FakeBackendFactory());
  try {
    await manager.use(project, {}, "a");
    await assert.rejects(() => manager.use(project, {}, "b"), /another agent process/);
  } finally {
    await manager.closeAll();
    await rm(project, { recursive: true, force: true });
  }
});
