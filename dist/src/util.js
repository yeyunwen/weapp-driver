import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
export function clientId() {
    return `client-${process.pid}-${randomUUID().slice(0, 8)}`;
}
export function defaultSocketPath() {
    const uid = typeof process.getuid === "function" ? process.getuid() : "user";
    return process.env.WEAPP_DRIVER_SOCKET || resolve(tmpdir(), `weapp-driver-${uid}.sock`);
}
export function resolveProjectPath(input) {
    if (!input)
        throw new Error("project path is required");
    if (input === "~")
        return homedir();
    if (input.startsWith("~/"))
        return resolve(homedir(), input.slice(2));
    return resolve(input);
}
export function sleep(ms) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
export function getByPath(value, path) {
    if (!path)
        return value;
    return path.split(".").reduce((current, part) => {
        if (current === null || current === undefined)
            return undefined;
        if (Array.isArray(current) && /^\d+$/.test(part))
            return current[Number(part)];
        if (typeof current !== "object")
            return undefined;
        return current[part];
    }, value);
}
export function tryParseJson(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return "";
    try {
        return JSON.parse(trimmed);
    }
    catch {
        const lines = trimmed.split(/\r?\n/);
        const last = lines.at(-1);
        if (last) {
            try {
                return JSON.parse(last);
            }
            catch {
                return trimmed;
            }
        }
        return trimmed;
    }
}
export async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const count = Math.max(1, Math.min(limit, items.length || 1));
    await Promise.all(Array.from({ length: count }, async () => {
        while (true) {
            const index = next++;
            if (index >= items.length)
                return;
            results[index] = await worker(items[index], index);
        }
    }));
    return results;
}
//# sourceMappingURL=util.js.map