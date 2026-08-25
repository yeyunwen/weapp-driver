import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { WebSocketServer } from "ws";

import { AutomatorBackendFactory } from "../src/automator-backend.js";
import { RefRegistry } from "../src/refs.js";
import { captureSemanticSnapshot } from "../src/snapshot.js";

test("automator protocol backend connects, snapshots, acts, navigates, and captures logs", async () => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  let route = "pages/index/index";
  let tapped = 0;

  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const request = JSON.parse(String(raw)) as { id: string; method: string; params: Record<string, unknown> };
      const result = response(request.method, request.params);
      socket.send(JSON.stringify({ id: request.id, result }));
      if (request.method === "App.enableLog") {
        socket.send(JSON.stringify({ method: "App.logAdded", params: { level: "info", text: "ready" } }));
      }
    });
  });

  function response(method: string, params: Record<string, unknown>) {
    switch (method) {
      case "Tool.getInfo":
        return { SDKVersion: "3.0.0" };
      case "App.enableLog":
        return {};
      case "App.getCurrentPage":
        return { pageId: 1, path: route, query: {} };
      case "App.getPageStack":
        return { pageStack: [{ pageId: 1, path: route, query: {} }] };
      case "Page.getElements":
        return { elements: [{ elementId: "button-1", tagName: "button" }] };
      case "Element.getWXML":
        return { wxml: params.type === "outer" ? '<button id="submit">提交</button>' : "提交" };
      case "Element.getDOMProperties":
        return { properties: (params.names as string[]).map((name) => (name === "innerText" ? "提交" : name === "offsetWidth" ? 100 : 40)) };
      case "Element.getOffset":
        return { left: 10, top: 20, width: 100, height: 40 };
      case "Element.tap":
        tapped += 1;
        return {};
      case "App.callWxMethod":
        if (["reLaunch", "navigateTo", "redirectTo", "switchTab"].includes(String(params.method))) {
          route = String((params.args as Array<{ url?: string }>)[0]?.url || route).replace(/^\//, "");
        }
        return { result: params.method === "getSystemInfoSync" ? { platform: "test" } : null };
      case "App.captureScreenshot":
        return { data: Buffer.from("fake").toString("base64") };
      default:
        return {};
    }
  }

  const backend = await new AutomatorBackendFactory().connect("/tmp/project", {
    wsEndpoint: `ws://127.0.0.1:${(address as { port: number }).port}`,
  });
  try {
    const page = await backend.currentPage();
    assert.ok(page);
    const snapshot = await captureSemanticSnapshot(page, new RefRegistry(), { includeLayout: true });
    assert.match(snapshot.content, /@1 button "提交"/);
    const button = await page.$("button");
    assert.ok(button);
    await button.tap();
    assert.equal(tapped, 1);

    await backend.navigate("reLaunch", "/pages/result/index");
    assert.equal((await backend.currentPage())?.path, "pages/result/index");
    assert.deepEqual(await backend.systemInfo(), { platform: "test" });
    assert.match(await backend.screenshot(), /^data:image\/png;base64,/);

    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(backend.logs()[0]?.type, "console");
  } finally {
    await backend.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
