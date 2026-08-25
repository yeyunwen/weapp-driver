import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { captureSemanticSnapshot } from "./snapshot.js";
import { resolveElement } from "./element-resolver.js";
import type { SessionManager } from "./session-manager.js";
import type { RpcRequest, SessionOptions, SnapshotOptions, WaitOptions, WechatideCall } from "./types.js";
import { callWechatide } from "./wechatide.js";
import { getByPath, sleep } from "./util.js";

export class RpcHandler {
  constructor(private readonly sessions: SessionManager) {}

  async handle(request: RpcRequest): Promise<unknown> {
    const params = request.params || {};
    switch (request.method) {
      case "ping":
        return { ok: true, pid: process.pid };
      case "session.use":
        return this.sessions.use(requiredString(params, "projectPath"), (params.options || {}) as SessionOptions, request.clientId, false);
      case "session.claim":
        return this.sessions.use(requiredString(params, "projectPath"), (params.options || {}) as SessionOptions, request.clientId, true);
      case "session.list":
        return this.sessions.list();
      case "session.release":
        this.sessions.release(requiredString(params, "projectPath"), request.clientId);
        return { done: true };
      case "session.handoff":
        return this.sessions.handoff(requiredString(params, "projectPath"), request.clientId);
      case "session.complete":
        return this.sessions.complete(requiredString(params, "projectPath"), request.clientId, requiredBoolean(params, "keep"));
      case "session.reset":
        return this.sessions.reset(requiredString(params, "projectPath"), request.clientId);
      case "mini.info":
        return this.miniInfo(request);
      case "mini.navigate":
        return this.miniNavigate(request);
      case "mini.evaluate":
        return this.session(request).backend.evaluate(requiredString(params, "source"), arrayParam(params, "args"));
      case "mini.callWx":
        return this.session(request).backend.callWx(requiredString(params, "method"), arrayParam(params, "args"));
      case "mini.mockWx":
        return this.session(request).backend.mockWx(requiredString(params, "method"), params.result, arrayParam(params, "args"));
      case "mini.restoreWx":
        return this.session(request).backend.restoreWx(requiredString(params, "method"));
      case "mini.screenshot":
        return this.screenshot(request);
      case "mini.scrollTo":
        return this.session(request).backend.pageScrollTo(requiredNumber(params, "scrollTop"));
      case "page.snapshot":
        return this.snapshot(request);
      case "page.query":
        return this.snapshot(request, { selector: requiredString(params, "selector") });
      case "page.click":
        return this.elementAction(request, "click");
      case "page.fill":
        return this.elementAction(request, "fill");
      case "page.text":
        return this.elementRead(request, "text");
      case "page.value":
        return this.elementRead(request, "value");
      case "page.wxml":
        return this.elementRead(request, "wxml");
      case "page.attribute":
        return this.elementRead(request, "attribute");
      case "page.style":
        return this.elementRead(request, "style");
      case "page.data":
        return this.currentPage(request).then((page) => page.data(optionalString(params, "path")));
      case "page.setData":
        return this.currentPage(request).then((page) => page.setData(params.data));
      case "page.callMethod":
        return this.currentPage(request).then((page) => page.callMethod(requiredString(params, "method"), ...arrayParam(params, "args")));
      case "wait.selector":
        return this.waitSelector(request);
      case "wait.route":
        return this.waitRoute(request);
      case "wait.data":
        return this.waitData(request);
      case "wait.function":
        return this.waitFunction(request);
      case "logs.read":
        return this.session(request).backend.logs(numberParam(params, "since") ?? 0);
      case "devtools.call":
        return callWechatide(params.call as WechatideCall);
      default:
        throw new Error(`Unknown RPC method: ${request.method}`);
    }
  }

  releaseClient(clientId: string) {
    this.sessions.releaseClient(clientId);
  }

  private session(request: RpcRequest) {
    return this.sessions.require(requiredString(request.params || {}, "projectPath"), request.clientId);
  }

  private async currentPage(request: RpcRequest) {
    const page = await this.session(request).backend.currentPage();
    if (!page) throw new Error("Mini Program has no current page");
    return page;
  }

  private async miniInfo(request: RpcRequest) {
    const backend = this.session(request).backend;
    const [currentPage, stack, systemInfo] = await Promise.all([
      backend.currentPage(),
      backend.pageStack(),
      backend.systemInfo().catch((error) => ({ error: String(error) })),
    ]);
    return {
      currentPage: currentPage ? { path: currentPage.path, query: currentPage.query } : null,
      pageStack: stack.map((page) => ({ path: page.path, query: page.query })),
      systemInfo,
    };
  }

  private async miniNavigate(request: RpcRequest) {
    const params = request.params || {};
    const action = requiredString(params, "action") as "navigateTo" | "redirectTo" | "navigateBack" | "reLaunch" | "switchTab";
    if (!["navigateTo", "redirectTo", "navigateBack", "reLaunch", "switchTab"].includes(action)) {
      throw new Error(`Unsupported navigation action: ${action}`);
    }
    const page = await this.session(request).backend.navigate(action, optionalString(params, "url"));
    return page ? { path: page.path, query: page.query } : null;
  }

  private async screenshot(request: RpcRequest) {
    const path = optionalString(request.params || {}, "path");
    if (path) await mkdir(dirname(path), { recursive: true });
    return this.session(request).backend.screenshot(path);
  }

  private async snapshot(request: RpcRequest, overrides: SnapshotOptions = {}) {
    const params = request.params || {};
    const session = this.session(request);
    const page = await this.currentPage(request);
    return captureSemanticSnapshot(page, session.registry, {
      ...(params.options as SnapshotOptions | undefined),
      ...overrides,
    });
  }

  private async elementAction(request: RpcRequest, action: "click" | "fill") {
    const params = request.params || {};
    const element = await resolveElement(this.session(request), requiredString(params, "target"), waitOptions(params));
    if (action === "click") {
      await element.tap();
      return { done: true };
    }
    const value = requiredString(params, "value");
    if (typeof element.input === "function") await element.input(value);
    else if (typeof element.trigger === "function") await element.trigger("input", { value });
    else throw new Error(`Element ${requiredString(params, "target")} does not support input`);
    return { done: true };
  }

  private async elementRead(request: RpcRequest, action: "text" | "value" | "wxml" | "attribute" | "style") {
    const params = request.params || {};
    const element = await resolveElement(this.session(request), requiredString(params, "target"), waitOptions(params));
    if (action === "text") return element.text();
    if (action === "value") return element.value();
    if (action === "wxml") return element.wxml();
    if (action === "attribute") return element.attribute(requiredString(params, "name"));
    return element.style(requiredString(params, "name"));
  }

  private async waitSelector(request: RpcRequest) {
    const params = request.params || {};
    const element = await resolveElement(this.session(request), requiredString(params, "target"), waitOptions(params));
    return { found: true, tag: element.tagName };
  }

  private async waitRoute(request: RpcRequest) {
    const params = request.params || {};
    const expected = requiredString(params, "route");
    return poll(waitOptions(params), async () => {
      const page = await this.currentPage(request);
      return routeMatches(page.path, expected) ? { path: page.path, query: page.query } : undefined;
    }, `route ${JSON.stringify(expected)}`);
  }

  private async waitData(request: RpcRequest) {
    const params = request.params || {};
    const path = requiredString(params, "path");
    const expected = params.expected;
    return poll(waitOptions(params), async () => {
      const page = await this.currentPage(request);
      const data = await page.data();
      const actual = getByPath(data, path);
      return deepEqual(actual, expected) ? { path, value: actual } : undefined;
    }, `page data ${path} to equal ${JSON.stringify(expected)}`);
  }

  private async waitFunction(request: RpcRequest) {
    const params = request.params || {};
    const source = requiredString(params, "source");
    const args = arrayParam(params, "args");
    return poll(waitOptions(params), async () => {
      const value = await this.session(request).backend.evaluate(source, args);
      return value ? value : undefined;
    }, "runtime function to become truthy");
  }
}

async function poll<T>(options: WaitOptions, check: () => Promise<T | undefined>, description: string) {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    try {
      const value = await check();
      if (value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}${lastError ? `; last error: ${String(lastError)}` : ""}`);
}

function routeMatches(actual: string, expected: string) {
  if (expected.startsWith("/") && expected.endsWith("/") && expected.length > 2) return new RegExp(expected.slice(1, -1)).test(actual);
  if (expected.includes("*")) {
    const pattern = expected.split("*").map(escapeRegex).join(".*");
    return new RegExp(`^${pattern}$`).test(actual);
  }
  return actual === expected;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requiredString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value !== "string" || !value) throw new Error(`${key} must be a non-empty string`);
  return value;
}

function optionalString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

function requiredBoolean(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function requiredNumber(params: Record<string, unknown>, key: string) {
  const value = Number(params[key]);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function numberParam(params: Record<string, unknown>, key: string) {
  if (params[key] === undefined) return undefined;
  return requiredNumber(params, key);
}

function arrayParam(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
}

function waitOptions(params: Record<string, unknown>): WaitOptions {
  return {
    timeoutMs: numberParam(params, "timeoutMs"),
    intervalMs: numberParam(params, "intervalMs"),
  };
}
