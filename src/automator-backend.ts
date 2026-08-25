import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { access, constants, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

import WebSocket from "ws";

import type { BackendFactory, MiniElement, MiniPage, MiniSessionBackend } from "./backend.js";
import type { ConsoleEntry, SessionOptions } from "./types.js";
import { sleep } from "./util.js";

type ProtocolMessage = {
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
};

type ElementDescriptor = {
  elementId: string;
  nodeId?: string;
  videoId?: string;
  tagName: string;
};

export class AutomatorBackendFactory implements BackendFactory {
  async connect(projectPath: string, options: SessionOptions): Promise<MiniSessionBackend> {
    if (options.wsEndpoint) return AutomatorSession.connect(options.wsEndpoint);
    const port = await choosePort(options.port ?? 9420, options.port !== undefined);
    const cliPath = await resolveCliPath(options.cliPath || defaultCliPath());
    const args = [
      ...(options.args || []),
      "auto",
      "--project",
      projectPath,
      "--auto-port",
      String(port),
    ];
    if (options.account) args.push("--auto-account", options.account);
    else if (options.ticket) args.push("--ticket", options.ticket);
    if (options.trustProject) args.push("--trust-project");
    let launchError: unknown;
    const child = spawn(cliPath, args, {
      cwd: options.cwd || undefined,
      detached: true,
      shell: process.platform === "win32",
      stdio: "ignore",
    });
    child.once("error", (error) => (launchError = error));
    child.unref();

    const endpoint = `ws://127.0.0.1:${port}`;
    const timeoutMs = 30_000;
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (launchError) throw new Error(`Failed launching WeChat DevTools: ${String(launchError)}`);
      try {
        const session = await AutomatorSession.connect(endpoint);
        await sleep(1_000);
        return session;
      } catch (error) {
        lastError = error;
        await sleep(300);
      }
    }
    throw new Error(`Failed connecting to ${endpoint}: ${String(lastError)}`);
  }
}

class AutomatorConnection extends EventEmitter {
  private readonly pending = new Map<string, { resolve(value: Record<string, unknown>): void; reject(error: unknown): void; timer: NodeJS.Timeout }>();
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    super();
    socket.on("message", (data) => this.onMessage(String(data)));
    socket.on("close", () => this.onClose());
    socket.on("error", (error) => this.emit("socketError", error));
  }

  static connect(endpoint: string) {
    return new Promise<AutomatorConnection>((resolvePromise, reject) => {
      const socket = new WebSocket(endpoint);
      const onError = (error: Error) => reject(error);
      socket.once("error", onError);
      socket.once("open", () => {
        socket.off("error", onError);
        resolvePromise(new AutomatorConnection(socket));
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}) {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Connection closed, check if WeChat DevTools is still running"));
    const id = randomUUID();
    return new Promise<Record<string, unknown>>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Automator protocol timed out: ${method}`));
      }, 20_000);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (pending) clearTimeout(pending.timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  close() {
    this.closed = true;
    this.socket.close();
    this.onClose();
  }

  private onMessage(text: string) {
    let message: ProtocolMessage;
    try {
      message = JSON.parse(text) as ProtocolMessage;
    } catch {
      return;
    }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || "Automator protocol error"));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method) this.emit(message.method, message.params || {});
  }

  private onClose() {
    if (this.closed && this.pending.size === 0) return;
    this.closed = true;
    const error = new Error("Connection closed, check if WeChat DevTools is still running");
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit("closed");
  }
}

class AutomatorSession implements MiniSessionBackend {
  private readonly entries: ConsoleEntry[] = [];
  private readonly pages = new Map<number, ProtocolPage>();
  private nextSeq = 1;

  private constructor(private readonly connection: AutomatorConnection) {
    connection.on("App.logAdded", (payload) => this.record("console", payload));
    connection.on("App.exceptionThrown", (payload) => this.record("exception", payload));
  }

  static async connect(endpoint: string) {
    const connection = await AutomatorConnection.connect(endpoint);
    const session = new AutomatorSession(connection);
    try {
      await connection.send("App.enableLog").catch(() => undefined);
      await session.checkVersion();
      return session;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  async currentPage() {
    const result = await this.connection.send("App.getCurrentPage");
    return this.page(result);
  }

  async pageStack() {
    const result = await this.connection.send("App.getPageStack");
    const stack = Array.isArray(result.pageStack) ? result.pageStack : [];
    return stack.map((entry) => this.page(entry as Record<string, unknown>));
  }

  async navigate(action: "navigateTo" | "redirectTo" | "navigateBack" | "reLaunch" | "switchTab", url?: string) {
    if (action !== "navigateBack" && !url) throw new Error(`${action} requires a url`);
    const current = await this.currentPage().catch(() => undefined);
    const pluginId = current?.path.match(/^plugin-private:\/\/([0-9a-zA-Z]+)\//)?.[1];
    const args = action === "navigateBack" ? [] : [{ url }];
    await this.connection.send("App.callWxMethod", { method: action, args, ...(pluginId ? { pluginId } : {}) });
    await sleep(500);
    return this.currentPage();
  }

  async systemInfo() {
    return this.callWx("getSystemInfoSync");
  }

  async evaluate(source: string, args: unknown[] = []) {
    const result = await this.connection.send("App.callFunction", { functionDeclaration: source, args });
    return result.result;
  }

  async callWx(method: string, args: unknown[] = []) {
    const result = await this.connection.send("App.callWxMethod", { method, args });
    return result.result;
  }

  async mockWx(method: string, result: unknown, args: unknown[] = []) {
    const params = typeof result === "string" && /^(?:function|\(?\s*[^=]*=>)/.test(result.trim())
      ? { method, functionDeclaration: result, args }
      : { method, result };
    await this.connection.send("App.mockWxMethod", params);
  }

  async restoreWx(method: string) {
    await this.connection.send("App.mockWxMethod", { method });
  }

  async screenshot(path?: string) {
    const result = await this.connection.send("App.captureScreenshot");
    const data = String(result.data || "");
    if (!path) return `data:image/png;base64,${data}`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, "base64");
    return path;
  }

  async pageScrollTo(scrollTop: number) {
    await this.callWx("pageScrollTo", [{ scrollTop, duration: 0 }]);
  }

  logs(since = 0) {
    return this.entries.filter((entry) => entry.seq > since);
  }

  async close() {
    this.connection.close();
  }

  private page(input: Record<string, unknown>) {
    const id = Number(input.pageId ?? input.id);
    if (!Number.isFinite(id)) throw new Error("Automator returned an invalid page id");
    let page = this.pages.get(id);
    if (!page) {
      page = new ProtocolPage(this.connection, id, String(input.path || ""), (input.query || {}) as Record<string, unknown>);
      this.pages.set(id, page);
    } else {
      page.path = String(input.path || page.path);
      page.query = (input.query || page.query) as Record<string, unknown>;
    }
    return page;
  }

  private async checkVersion() {
    const result: Record<string, unknown> = await this.connection.send("Tool.getInfo").catch(() => ({}));
    const version = String(result.SDKVersion || "");
    if (version && version !== "dev" && compareVersion(version, "2.7.3") < 0) {
      throw new Error(`Mini Program base library ${version} is too old; 2.7.3 or newer is required`);
    }
  }

  private record(type: ConsoleEntry["type"], payload: unknown) {
    this.entries.push({ seq: this.nextSeq++, time: new Date().toISOString(), type, payload });
    if (this.entries.length > 2_000) this.entries.splice(0, this.entries.length - 2_000);
  }
}

class ProtocolPage implements MiniPage {
  private readonly elements = new Map<string, ProtocolElement>();

  constructor(
    private readonly connection: AutomatorConnection,
    private readonly id: number,
    public path: string,
    public query: Record<string, unknown>,
  ) {}

  async $(selector: string) {
    try {
      const result = await this.send("Page.getElement", { selector });
      return this.element(result as unknown as ElementDescriptor);
    } catch {
      return null;
    }
  }

  async $$(selector: string) {
    const result = await this.send("Page.getElements", { selector });
    const elements = Array.isArray(result.elements) ? result.elements : [];
    return elements.map((entry) => this.element(entry as ElementDescriptor));
  }

  async data(path?: string) {
    const result = await this.send("Page.getData", path ? { path } : {});
    return result.data;
  }

  async setData(data: unknown) {
    await this.send("Page.setData", { data });
  }

  async callMethod(method: string, ...args: unknown[]) {
    const result = await this.send("Page.callMethod", { method, args });
    return result.result;
  }

  async waitFor(condition: string | number | Function) {
    if (typeof condition === "number") return sleep(condition);
    if (typeof condition === "string") {
      while ((await this.$$(condition)).length === 0) await sleep(100);
      return;
    }
    while (!(await condition())) await sleep(100);
  }

  async scrollTop() {
    const result = await this.send("Page.getWindowProperties", {
      names: ["document.body.scrollTop", "document.documentElement.scrollTop"],
    });
    const properties = Array.isArray(result.properties) ? result.properties : [];
    return String(properties[0] || properties[1] || "0");
  }

  private element(descriptor: ElementDescriptor) {
    let element = this.elements.get(descriptor.elementId);
    if (!element) {
      element = new ProtocolElement(this.connection, this.id, descriptor);
      this.elements.set(descriptor.elementId, element);
    }
    return element;
  }

  private send(method: string, params: Record<string, unknown>) {
    return this.connection.send(method, { ...params, pageId: this.id });
  }
}

class ProtocolElement implements MiniElement {
  readonly tagName: string;

  constructor(
    private readonly connection: AutomatorConnection,
    private readonly pageId: number,
    private readonly descriptor: ElementDescriptor,
  ) {
    this.tagName = descriptor.tagName;
  }

  async text() {
    return String(await this.getter("innerText", "Element.getDOMProperties", "properties"));
  }

  async outerWxml() {
    const result = await this.send("Element.getWXML", { type: "outer" });
    return String(result.wxml || "");
  }

  offset() {
    return this.send("Element.getOffset");
  }

  async size() {
    const values = await this.getter(["offsetWidth", "offsetHeight"], "Element.getDOMProperties", "properties");
    const array = values as unknown[];
    return { width: Number(array[0] || 0), height: Number(array[1] || 0) };
  }

  async tap() {
    await this.send("Element.tap");
  }

  async input(value: string) {
    if (!["input", "textarea"].includes(this.tagName)) throw new Error(`${this.tagName} does not support input`);
    await this.send("Element.callFunction", { functionName: `${this.tagName}.input`, args: [value] });
  }

  async trigger(type: string, detail?: unknown) {
    await this.send("Element.triggerEvent", { type, ...(detail === undefined ? {} : { detail }) });
  }

  async attribute(name: string) {
    return String(await this.getter(name, "Element.getAttributes", "attributes"));
  }

  async style(name: string) {
    return String(await this.getter(name, "Element.getStyles", "styles"));
  }

  property(name: string) {
    return this.getter(name, "Element.getProperties", "properties");
  }

  value() {
    return this.property("value");
  }

  async wxml() {
    const result = await this.send("Element.getWXML", { type: "inner" });
    return String(result.wxml || "");
  }

  private async getter(name: string | string[], method: string, resultKey: string) {
    const names = Array.isArray(name) ? name : [name];
    const result = await this.send(method, { names });
    const values = Array.isArray(result[resultKey]) ? result[resultKey] as unknown[] : [];
    return Array.isArray(name) ? values : values[0];
  }

  private send(method: string, params: Record<string, unknown> = {}) {
    return this.connection.send(method, {
      ...params,
      elementId: this.descriptor.elementId,
      pageId: this.pageId,
      ...(this.descriptor.nodeId ? { nodeId: this.descriptor.nodeId } : {}),
      ...(this.descriptor.videoId ? { videoId: this.descriptor.videoId } : {}),
    });
  }
}

function defaultCliPath() {
  if (process.platform === "win32") return "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";
  if (process.platform === "darwin") return "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
  return "wechatide";
}

async function resolveCliPath(input: string) {
  if (input.includes("/") || input.includes("\\")) {
    await access(input, constants.X_OK).catch(() => {
      throw new Error(`WeChat DevTools CLI was not found or executable at ${input}; pass cliPath to useProject()`);
    });
    return input;
  }
  const pathEntries = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const extensions = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const directory of pathEntries) {
    for (const extension of extensions) {
      const candidate = `${directory}/${input}${extension}`;
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  throw new Error(`WeChat DevTools CLI ${input} was not found on PATH; pass cliPath to useProject()`);
}

async function choosePort(preferred: number, strict: boolean) {
  if (await portAvailable(preferred)) return preferred;
  if (strict) throw new Error(`Port ${preferred} is already in use`);
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

function portAvailable(port: number) {
  return new Promise<boolean>((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
  });
}

function compareVersion(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
