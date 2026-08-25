import assert from "node:assert/strict";
import test from "node:test";

import { createHelperContext } from "../src/helpers.js";
import type { RpcClient } from "../src/rpc-client.js";

test("test helpers collect checks and produce a structured report", () => {
  const client = { call: async () => undefined } as unknown as RpcClient;
  const helpers = createHelperContext(client);

  helpers.test.check("truthy", true, { source: "fixture" });
  helpers.test.equal("same value", 2, 2);
  helpers.test.match("contains text", "order confirmed", /confirmed/);

  assert.deepEqual(helpers.test.report({ route: "/pages/order/confirm" }), {
    ok: true,
    checks: [
      { name: "truthy", pass: true, evidence: { source: "fixture" } },
      { name: "same value", pass: true, evidence: { actual: 2, expected: 2 } },
      { name: "contains text", pass: true, evidence: { actual: "order confirmed", expected: "/confirmed/" } },
    ],
    route: "/pages/order/confirm",
  });
});

test("test reports remain failed when any check fails", () => {
  const client = { call: async () => undefined } as unknown as RpcClient;
  const helpers = createHelperContext(client);

  helpers.test.check("missing button", false);
  helpers.test.equal("wrong route", "/pages/a", "/pages/b");

  assert.equal(helpers.test.report().ok, false);
});
