import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { sleep } from "./util.js";
export class AutomatorBackendFactory {
    async connect(projectPath, options) {
        if (options.wsEndpoint)
            return AutomatorSession.connect(options.wsEndpoint);
        const preferredPort = options.port ?? 9420;
        if (!(await portAvailable(preferredPort))) {
            const existing = await reuseExistingSession(projectPath, preferredPort);
            if (existing)
                return existing;
        }
        const port = await choosePort(preferredPort, options.port !== undefined);
        const cliPath = await resolveCliPath(options.cliPath || defaultCliPath());
        const args = [
            ...(options.args || []),
            "auto",
            "--project",
            projectPath,
            "--auto-port",
            String(port),
        ];
        if (options.account)
            args.push("--auto-account", options.account);
        else if (options.ticket)
            args.push("--ticket", options.ticket);
        if (options.trustProject)
            args.push("--trust-project");
        let launchError;
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
        let lastError;
        while (Date.now() < deadline) {
            if (launchError)
                throw new Error(`Failed launching WeChat DevTools: ${String(launchError)}`);
            try {
                const session = await AutomatorSession.connect(endpoint);
                await sleep(1_000);
                return session;
            }
            catch (error) {
                lastError = error;
                await sleep(300);
            }
        }
        throw new Error(`Failed connecting to ${endpoint}: ${String(lastError)}`);
    }
}
class AutomatorConnection extends EventEmitter {
    socket;
    pending = new Map();
    closed = false;
    constructor(socket) {
        super();
        this.socket = socket;
        socket.on("message", (data) => this.onMessage(String(data)));
        socket.on("close", () => this.onClose());
        socket.on("error", (error) => this.emit("socketError", error));
    }
    static connect(endpoint, timeoutMs = 20_000) {
        return new Promise((resolvePromise, reject) => {
            const socket = new WebSocket(endpoint);
            const timer = setTimeout(() => {
                cleanup();
                socket.terminate();
                reject(new Error(`Timed out connecting to Automator endpoint ${endpoint}`));
            }, timeoutMs);
            const cleanup = () => {
                clearTimeout(timer);
                socket.off("error", onError);
                socket.off("open", onOpen);
            };
            const onError = (error) => {
                cleanup();
                reject(error);
            };
            const onOpen = () => {
                cleanup();
                resolvePromise(new AutomatorConnection(socket));
            };
            socket.once("error", onError);
            socket.once("open", onOpen);
        });
    }
    send(method, params = {}, timeoutMs = 20_000) {
        if (this.closed || this.socket.readyState !== WebSocket.OPEN)
            return Promise.reject(new Error("Connection closed, check if WeChat DevTools is still running"));
        const id = randomUUID();
        return new Promise((resolvePromise, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Automator protocol timed out: ${method}`));
            }, timeoutMs);
            this.pending.set(id, { method, resolve: resolvePromise, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }), (error) => {
                if (!error)
                    return;
                const pending = this.pending.get(id);
                if (pending)
                    clearTimeout(pending.timer);
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
    onMessage(text) {
        let message;
        try {
            message = JSON.parse(text);
        }
        catch {
            return;
        }
        if (message.id) {
            const pending = this.pending.get(message.id);
            if (!pending)
                return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) {
                pending.reject(new Error(`${pending.method}: ${message.error.message || "Automator protocol error"}`));
            }
            else
                pending.resolve(message.result || {});
            return;
        }
        if (message.method)
            this.emit(message.method, message.params || {});
    }
    onClose() {
        if (this.closed && this.pending.size === 0)
            return;
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
class AutomatorSession {
    connection;
    entries = [];
    pages = new Map();
    nextSeq = 1;
    constructor(connection) {
        this.connection = connection;
        connection.on("App.logAdded", (payload) => this.record("console", payload));
        connection.on("App.exceptionThrown", (payload) => this.record("exception", payload));
    }
    static async connect(endpoint, timeoutMs = 20_000) {
        const connection = await AutomatorConnection.connect(endpoint, timeoutMs);
        const session = new AutomatorSession(connection);
        try {
            await connection.send("App.enableLog", {}, timeoutMs).catch(() => undefined);
            await session.checkVersion(timeoutMs);
            return session;
        }
        catch (error) {
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
        return stack.map((entry) => this.page(entry));
    }
    async navigate(action, url) {
        if (action !== "navigateBack" && !url)
            throw new Error(`${action} requires a url`);
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
    async evaluate(source, args = []) {
        const result = await this.connection.send("App.callFunction", { functionDeclaration: source, args });
        return result.result;
    }
    async callWx(method, args = []) {
        const result = await this.connection.send("App.callWxMethod", { method, args });
        return result.result;
    }
    async mockWx(method, result, args = []) {
        const params = typeof result === "string" && /^(?:function|\(?\s*[^=]*=>)/.test(result.trim())
            ? { method, functionDeclaration: result, args }
            : { method, result };
        await this.connection.send("App.mockWxMethod", params);
    }
    async restoreWx(method) {
        await this.connection.send("App.mockWxMethod", { method });
    }
    async screenshot(path) {
        const result = await this.connection.send("App.captureScreenshot");
        const data = String(result.data || "");
        if (!path)
            return `data:image/png;base64,${data}`;
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data, "base64");
        return path;
    }
    async pageScrollTo(scrollTop) {
        await this.callWx("pageScrollTo", [{ scrollTop, duration: 0 }]);
    }
    logs(since = 0) {
        return this.entries.filter((entry) => entry.seq > since);
    }
    async close() {
        this.connection.close();
    }
    page(input) {
        const id = Number(input.pageId ?? input.id);
        if (!Number.isFinite(id))
            throw new Error("Automator returned an invalid page id");
        let page = this.pages.get(id);
        if (!page) {
            page = new ProtocolPage(this.connection, id, String(input.path || ""), (input.query || {}));
            this.pages.set(id, page);
        }
        else {
            page.path = String(input.path || page.path);
            page.query = (input.query || page.query);
        }
        return page;
    }
    async checkVersion(timeoutMs = 20_000) {
        const result = await this.connection.send("Tool.getInfo", {}, timeoutMs).catch(() => ({}));
        const version = String(result.SDKVersion || "");
        if (version && version !== "dev" && compareVersion(version, "2.7.3") < 0) {
            throw new Error(`Mini Program base library ${version} is too old; 2.7.3 or newer is required`);
        }
    }
    record(type, payload) {
        this.entries.push({ seq: this.nextSeq++, time: new Date().toISOString(), type, payload });
        if (this.entries.length > 2_000)
            this.entries.splice(0, this.entries.length - 2_000);
    }
}
class ProtocolPage {
    connection;
    id;
    path;
    query;
    elements = new Map();
    constructor(connection, id, path, query) {
        this.connection = connection;
        this.id = id;
        this.path = path;
        this.query = query;
    }
    async $(selector) {
        try {
            const result = await this.send("Page.getElement", { selector });
            return this.element(result);
        }
        catch {
            return null;
        }
    }
    async $$(selector) {
        const result = await this.send("Page.getElements", { selector });
        const elements = Array.isArray(result.elements) ? result.elements : [];
        return elements.map((entry) => this.element(entry));
    }
    async data(path) {
        const result = await this.send("Page.getData", path ? { path } : {});
        return result.data;
    }
    async setData(data) {
        await this.send("Page.setData", { data });
    }
    async callMethod(method, ...args) {
        const result = await this.send("Page.callMethod", { method, args });
        return result.result;
    }
    async waitFor(condition) {
        if (typeof condition === "number")
            return sleep(condition);
        if (typeof condition === "string") {
            while ((await this.$$(condition)).length === 0)
                await sleep(100);
            return;
        }
        while (!(await condition()))
            await sleep(100);
    }
    async scrollTop() {
        const result = await this.send("Page.getWindowProperties", {
            names: ["document.body.scrollTop", "document.documentElement.scrollTop"],
        });
        const properties = Array.isArray(result.properties) ? result.properties : [];
        return String(properties[0] || properties[1] || "0");
    }
    element(descriptor) {
        let element = this.elements.get(descriptor.elementId);
        if (!element) {
            element = new ProtocolElement(this.connection, this.id, descriptor);
            this.elements.set(descriptor.elementId, element);
        }
        return element;
    }
    send(method, params) {
        return this.connection.send(method, { ...params, pageId: this.id });
    }
}
class ProtocolElement {
    connection;
    pageId;
    descriptor;
    tagName;
    isCustomComponent;
    constructor(connection, pageId, descriptor) {
        this.connection = connection;
        this.pageId = pageId;
        this.descriptor = descriptor;
        this.tagName = descriptor.tagName;
        this.isCustomComponent = Boolean(descriptor.nodeId);
    }
    async $(selector) {
        try {
            const result = await this.send("Element.getElement", { selector });
            return new ProtocolElement(this.connection, this.pageId, result);
        }
        catch {
            return null;
        }
    }
    async $$(selector) {
        const result = await this.send("Element.getElements", { selector });
        const elements = Array.isArray(result.elements) ? result.elements : [];
        return elements.map((entry) => new ProtocolElement(this.connection, this.pageId, entry));
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
        const array = values;
        return { width: Number(array[0] || 0), height: Number(array[1] || 0) };
    }
    async tap() {
        await this.send("Element.tap");
    }
    async input(value) {
        if (!["input", "textarea"].includes(this.tagName))
            throw new Error(`${this.tagName} does not support input`);
        await this.send("Element.callFunction", { functionName: `${this.tagName}.input`, args: [value] });
    }
    async trigger(type, detail) {
        await this.send("Element.triggerEvent", { type, ...(detail === undefined ? {} : { detail }) });
    }
    async attribute(name) {
        return String(await this.getter(name, "Element.getAttributes", "attributes"));
    }
    async style(name) {
        return String(await this.getter(name, "Element.getStyles", "styles"));
    }
    property(name) {
        return this.getter(name, "Element.getProperties", "properties");
    }
    value() {
        return this.property("value");
    }
    async wxml() {
        const result = await this.send("Element.getWXML", { type: "inner" });
        return String(result.wxml || "");
    }
    async data(path) {
        this.assertCustomComponent("data");
        const result = await this.send("Element.getData", path ? { path } : {});
        return result.data;
    }
    async setData(data) {
        this.assertCustomComponent("setData");
        await this.send("Element.setData", { data });
    }
    async callMethod(method, ...args) {
        this.assertCustomComponent("callMethod");
        const result = await this.send("Element.callMethod", { method, args });
        return result.result;
    }
    async getter(name, method, resultKey) {
        const names = Array.isArray(name) ? name : [name];
        const result = await this.send(method, { names });
        const values = Array.isArray(result[resultKey]) ? result[resultKey] : [];
        return Array.isArray(name) ? values : values[0];
    }
    send(method, params = {}) {
        return this.connection.send(method, {
            ...params,
            elementId: this.descriptor.elementId,
            pageId: this.pageId,
            ...(this.descriptor.nodeId ? { nodeId: this.descriptor.nodeId } : {}),
            ...(this.descriptor.videoId ? { videoId: this.descriptor.videoId } : {}),
        });
    }
    assertCustomComponent(action) {
        if (!this.isCustomComponent) {
            throw new Error(`${this.tagName} is not a custom component and does not support ${action}`);
        }
    }
}
function defaultCliPath() {
    if (process.platform === "win32")
        return "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";
    if (process.platform === "darwin")
        return "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
    return "wechatide";
}
async function resolveCliPath(input) {
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
            }
            catch {
                // Try the next PATH entry.
            }
        }
    }
    throw new Error(`WeChat DevTools CLI ${input} was not found on PATH; pass cliPath to useProject()`);
}
async function choosePort(preferred, strict) {
    if (await portAvailable(preferred))
        return preferred;
    if (strict)
        throw new Error(`Port ${preferred} is already in use`);
    return new Promise((resolvePromise, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            server.close(() => resolvePromise(port));
        });
    });
}
async function reuseExistingSession(projectPath, port) {
    let session;
    try {
        session = await AutomatorSession.connect(`ws://127.0.0.1:${port}`, 1_500);
        const expectedAppIds = await projectAppIds(projectPath);
        if (expectedAppIds.size === 0) {
            await session.close();
            return undefined;
        }
        const accountInfo = await session.callWx("getAccountInfoSync");
        const actualAppId = runtimeAppId(accountInfo);
        if (!actualAppId || !expectedAppIds.has(actualAppId)) {
            await session.close();
            return undefined;
        }
        return session;
    }
    catch {
        await session?.close().catch(() => undefined);
        return undefined;
    }
}
async function projectAppIds(projectPath) {
    const appIds = new Set();
    for (const file of ["ext.json", "project.config.json"]) {
        try {
            const value = JSON.parse(await readFile(`${projectPath}/${file}`, "utf8"));
            for (const candidate of [
                value.extAppid,
                value.appid,
                value.ext?.appId,
            ]) {
                if (typeof candidate === "string" && candidate)
                    appIds.add(candidate);
            }
        }
        catch {
            // This metadata file cannot identify the running project.
        }
    }
    return appIds;
}
function runtimeAppId(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const miniProgram = value.miniProgram;
    if (!miniProgram || typeof miniProgram !== "object")
        return undefined;
    const appId = miniProgram.appId;
    return typeof appId === "string" ? appId : undefined;
}
async function portAvailable(port) {
    if (await portAcceptsConnections(port))
        return false;
    return new Promise((resolvePromise) => {
        const server = createServer();
        server.once("error", () => resolvePromise(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
    });
}
function portAcceptsConnections(port) {
    return new Promise((resolvePromise) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            resolvePromise(value);
        };
        socket.setTimeout(300);
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.once("timeout", () => finish(false));
    });
}
function compareVersion(left, right) {
    const a = left.split(".").map(Number);
    const b = right.split(".").map(Number);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const difference = (a[index] || 0) - (b[index] || 0);
        if (difference !== 0)
            return difference;
    }
    return 0;
}
//# sourceMappingURL=automator-backend.js.map