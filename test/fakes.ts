import type { BackendFactory, MiniElement, MiniPage, MiniSessionBackend } from "../src/backend.js";
import type { ConsoleEntry, SessionOptions } from "../src/types.js";

export class FakeElement implements MiniElement {
  valueState: unknown = "";
  tapped = 0;

  constructor(
    readonly tagName: string,
    readonly attrs: Record<string, string>,
    private textState: string,
    private readonly box = { left: 0, top: 0, width: 100, height: 30 },
  ) {}

  text() {
    return Promise.resolve(this.textState);
  }

  outerWxml() {
    const attrs = Object.entries(this.attrs).map(([key, value]) => `${key}="${value}"`).join(" ");
    return Promise.resolve(`<${this.tagName}${attrs ? ` ${attrs}` : ""}>${this.textState}</${this.tagName}>`);
  }

  offset() {
    return Promise.resolve(this.box);
  }

  size() {
    return Promise.resolve({ width: this.box.width, height: this.box.height });
  }

  async tap() {
    this.tapped += 1;
  }

  async input(value: string) {
    this.valueState = value;
  }

  async trigger(_type: string, detail?: unknown) {
    this.valueState = (detail as { value?: unknown } | undefined)?.value;
  }

  attribute(name: string) {
    return Promise.resolve(this.attrs[name] || "");
  }

  style(_name: string) {
    return Promise.resolve("");
  }

  property(name: string) {
    return Promise.resolve(name === "value" ? this.valueState : undefined);
  }

  value() {
    return Promise.resolve(this.valueState);
  }

  wxml() {
    return Promise.resolve(this.textState);
  }
}

export class FakePage implements MiniPage {
  dataState: Record<string, unknown> = { loading: false, order: { id: 1 } };

  constructor(
    public path = "pages/index/index",
    public query: Record<string, unknown> = {},
    readonly elements: FakeElement[] = [
      new FakeElement("button", { id: "submit", class: "primary" }, "提交", { left: 10, top: 20, width: 120, height: 44 }),
      new FakeElement("input", { "data-testid": "reason" }, ""),
    ],
  ) {}

  async $(selector: string) {
    return (await this.$$(selector))[0] || null;
  }

  async $$(selector: string) {
    if (selector === "*") return this.elements;
    if (selector.startsWith("#")) return this.elements.filter((element) => element.attrs.id === selector.slice(1));
    const attr = /^\[([^=]+)="([^"]+)"\]$/.exec(selector);
    if (attr) return this.elements.filter((element) => element.attrs[attr[1] as string] === attr[2]);
    const tagAttr = /^([\w-]+)\[([^=]+)="([^"]+)"\]$/.exec(selector);
    if (tagAttr) return this.elements.filter((element) => element.tagName === tagAttr[1] && element.attrs[tagAttr[2] as string] === tagAttr[3]);
    return this.elements.filter((element) => element.tagName === selector);
  }

  async data(path?: string) {
    if (!path) return this.dataState;
    return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], this.dataState);
  }

  async setData(data: unknown) {
    Object.assign(this.dataState, data);
  }

  async callMethod(method: string, ...args: unknown[]) {
    return { method, args };
  }

  async waitFor(condition: string | number | Function) {
    if (typeof condition === "number") await new Promise((resolve) => setTimeout(resolve, condition));
  }

  async scrollTop() {
    return "0";
  }
}

export class FakeBackend implements MiniSessionBackend {
  readonly page = new FakePage();
  closed = false;
  entries: ConsoleEntry[] = [];

  async currentPage() {
    return this.page;
  }

  async pageStack() {
    return [this.page];
  }

  async navigate(action: "navigateTo" | "redirectTo" | "navigateBack" | "reLaunch" | "switchTab", url?: string) {
    if (action !== "navigateBack" && url) this.page.path = url.replace(/^\//, "");
    return this.page;
  }

  async systemInfo() {
    return { platform: "test" };
  }

  async evaluate(source: string) {
    if (source.includes("true")) return true;
    return { source };
  }

  async callWx(method: string, args: unknown[] = []) {
    return { method, args };
  }

  async mockWx() {}
  async restoreWx() {}

  async screenshot(path?: string) {
    return path || "data:image/png;base64,ZmFrZQ==";
  }

  async pageScrollTo() {}

  logs(since = 0) {
    return this.entries.filter((entry) => entry.seq > since);
  }

  async close() {
    this.closed = true;
  }
}

export class FakeBackendFactory implements BackendFactory {
  readonly backends = new Map<string, FakeBackend>();

  async connect(projectPath: string, _options: SessionOptions) {
    const backend = new FakeBackend();
    this.backends.set(projectPath, backend);
    return backend;
  }
}
