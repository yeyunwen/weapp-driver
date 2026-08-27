import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { WebSocketServer } from "ws";

import { AutomatorBackendFactory } from "../src/automator-backend.js";
import { RefRegistry } from "../src/refs.js";
import { captureSemanticSnapshot } from "../src/snapshot.js";

test("automator backend reuses an existing endpoint for the same app id", async () => {
  const project = await mkdtemp(join(tmpdir(), "weapp-driver-reuse-"));
  await writeFile(join(project, "ext.json"), JSON.stringify({ extAppid: "wx-test-app" }));
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  const methods: string[] = [];

  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const request = JSON.parse(String(raw)) as { id: string; method: string; params: Record<string, unknown> };
      methods.push(request.method);
      const result = request.method === "Tool.getInfo"
        ? { SDKVersion: "3.0.0" }
        : request.method === "App.callWxMethod" && request.params.method === "getAccountInfoSync"
          ? { result: { miniProgram: { appId: "wx-test-app" } } }
          : request.method === "App.getCurrentPage"
            ? { pageId: 1, path: "pages/index/index", query: {} }
            : {};
      socket.send(JSON.stringify({ id: request.id, result }));
    });
  });

  const backend = await new AutomatorBackendFactory().connect(project, {
    port: (address as { port: number }).port,
  });
  try {
    assert.equal((await backend.currentPage())?.path, "pages/index/index");
    assert.ok(methods.includes("App.callWxMethod"));
  } finally {
    await backend.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(project, { recursive: true, force: true });
  }
});

test("automator protocol backend connects, snapshots, acts, navigates, and captures logs", async () => {
  const server = new WebSocketServer({ port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  let route = "pages/index/index";
  let tapped = 0;
  const customData = { showTopBar: false };

  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const request = JSON.parse(String(raw)) as { id: string; method: string; params: Record<string, unknown> };
      if (request.method === "Element.callMethod" && request.params.method === "explode") {
        socket.send(JSON.stringify({ id: request.id, error: { message: "boom" } }));
        return;
      }
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
        if (params.selector === "custom-card") {
          return { elements: [{ elementId: "custom-1", nodeId: "node-1", tagName: "custom-card" }] };
        }
        return { elements: [{ elementId: "button-1", tagName: "button" }] };
      case "Page.getElement":
        if (params.selector === "custom-card") {
          return { elementId: "custom-1", nodeId: "node-1", tagName: "custom-card" };
        }
        return { elementId: "button-1", tagName: "button" };
      case "Element.getElements":
        return { elements: [{ elementId: "nested-button-1", tagName: "button" }] };
      case "Element.getData":
        return { data: params.path ? customData[String(params.path) as keyof typeof customData] : customData };
      case "Element.setData":
        Object.assign(customData, params.data);
        return {};
      case "Element.callMethod":
        return { result: { method: params.method, args: params.args, showTopBar: customData.showTopBar } };
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

    const custom = await page.$("custom-card");
    assert.ok(custom?.isCustomComponent);
    assert.deepEqual(await custom.data?.(), { showTopBar: false });
    await custom.setData?.({ showTopBar: true });
    assert.equal(await custom.data?.("showTopBar"), true);
    assert.deepEqual(await custom.callMethod?.("refresh", 1), {
      method: "refresh",
      args: [1],
      showTopBar: true,
    });
    assert.ok(custom.callMethod);
    assert.ok(custom.$$);
    await assert.rejects(custom.callMethod("explode"), /Element\.callMethod: boom/);
    assert.equal((await custom.$$("button"))[0]?.tagName, "button");

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
