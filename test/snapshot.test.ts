import assert from "node:assert/strict";
import test from "node:test";

import { captureSemanticSnapshot } from "../src/snapshot.js";
import { RefRegistry } from "../src/refs.js";
import { FakePage } from "./fakes.js";

test("semantic snapshot emits refs, stable locators, text, and layout", async () => {
  const page = new FakePage();
  const registry = new RefRegistry();
  const snapshot = await captureSemanticSnapshot(page, registry, { includeLayout: true });

  assert.match(snapshot.content, /@1 button "提交"/);
  assert.match(snapshot.content, /loc=css:#submit/);
  assert.match(snapshot.content, /@2 input/);
  assert.match(snapshot.content, /data-testid/);
  assert.match(snapshot.content, /\{x:10,y:20,w:120,h:44\}/);
  assert.equal(registry.resolve("@1"), page.elements[0]);
});

test("refs become stale when an element is absent from the latest snapshot", async () => {
  const page = new FakePage();
  const registry = new RefRegistry();
  await captureSemanticSnapshot(page, registry);
  page.elements.shift();
  await captureSemanticSnapshot(page, registry);
  assert.throws(() => registry.resolve("@1"), /stale snapshot ref/);
});
