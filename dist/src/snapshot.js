import { mapLimit } from "./util.js";
const DEFAULT_SELECTOR = "*";
export async function captureSemanticSnapshot(page, registry, options = {}) {
    const selector = options.selector || DEFAULT_SELECTOR;
    const maxElements = options.maxElements ?? 300;
    const allElements = await page.$$(selector);
    return captureSemanticElements(page, allElements, registry, options, maxElements);
}
export async function captureSemanticElements(page, allElements, registry, options = {}, maxElements = options.maxElements ?? 300) {
    const elements = allElements.slice(0, maxElements);
    registry.beginSnapshot();
    const refs = await mapLimit(elements, options.concurrency ?? 12, (element) => summarize(element, registry, options));
    const lines = [
        `page ${JSON.stringify(page.path)}${Object.keys(page.query || {}).length ? ` query=${JSON.stringify(page.query)}` : ""}`,
        ...refs.map(formatElement),
    ];
    if (allElements.length > maxElements)
        lines.push(`… truncated ${allElements.length - maxElements} elements at maxElements=${maxElements}`);
    return {
        content: lines.join("\n"),
        refs,
        page: { path: page.path, query: page.query || {} },
        capturedAt: new Date().toISOString(),
    };
}
async function summarize(element, registry, options) {
    const ref = registry.register(element);
    const [outer, rawText, box] = await Promise.all([
        safe(() => element.outerWxml(), ""),
        safe(() => element.text(), ""),
        options.includeLayout ? readBox(element) : Promise.resolve(undefined),
    ]);
    const attributes = parseAttributes(outer);
    const opaqueAttributes = Object.entries(attributes)
        .filter(([, value]) => /^\[object [^\]]+\]$/.test(value))
        .map(([name]) => name);
    const text = normalizeText(rawText || stripMarkup(outer));
    const locator = stableLocator(element.tagName, attributes);
    return {
        ref,
        tag: element.tagName || openingTag(outer) || "element",
        text,
        locator,
        attributes,
        ...(opaqueAttributes.length ? { opaqueAttributes } : {}),
        box,
    };
}
function formatElement(element) {
    const parts = [element.ref, element.tag];
    if (element.text)
        parts.push(JSON.stringify(element.text));
    if (element.locator)
        parts.push(`[loc=${element.locator}]`);
    const attrs = Object.entries(element.attributes)
        .filter(([name]) => ["id", "class", "name", "type", "role", "data-testid", "data-qa", "aria-label"].includes(name))
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`);
    if (attrs.length)
        parts.push(`[${attrs.join(" ")}]`);
    if (element.opaqueAttributes?.length)
        parts.push(`[opaque=${element.opaqueAttributes.join(",")}]`);
    if (element.box)
        parts.push(`{x:${element.box.x},y:${element.box.y},w:${element.box.width},h:${element.box.height}}`);
    return parts.join(" ");
}
function stableLocator(tag, attributes) {
    if (attributes.id)
        return `css:#${cssEscape(attributes.id)}`;
    if (attributes["data-testid"])
        return `css:[data-testid=${JSON.stringify(attributes["data-testid"])}]`;
    if (attributes["data-qa"])
        return `css:[data-qa=${JSON.stringify(attributes["data-qa"])}]`;
    if (attributes.name)
        return `css:${tag}[name=${JSON.stringify(attributes.name)}]`;
    return undefined;
}
function parseAttributes(wxml) {
    const open = /<[^\s>/]+\s*([^>]*)>/.exec(wxml)?.[1] || "";
    const attributes = {};
    const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const match of open.matchAll(pattern)) {
        const name = match[1];
        if (!name)
            continue;
        attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return attributes;
}
function openingTag(wxml) {
    return /<([^\s>/]+)/.exec(wxml)?.[1];
}
function stripMarkup(value) {
    return decodeEntities(value.replace(/<[^>]*>/g, " "));
}
function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
}
function decodeEntities(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}
function cssEscape(value) {
    return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
async function readBox(element) {
    const [offset, size] = await Promise.all([safe(() => element.offset(), {}), safe(() => element.size(), { width: 0, height: 0 })]);
    const x = numberFrom(offset, ["left", "x"]);
    const y = numberFrom(offset, ["top", "y"]);
    const width = Number(size.width) || numberFrom(offset, ["width"]);
    const height = Number(size.height) || numberFrom(offset, ["height"]);
    if (![x, y, width, height].every(Number.isFinite))
        return undefined;
    return { x, y, width, height };
}
function numberFrom(value, keys) {
    for (const key of keys) {
        const number = Number(value[key]);
        if (Number.isFinite(number))
            return number;
    }
    return 0;
}
async function safe(fn, fallback) {
    try {
        return await fn();
    }
    catch {
        return fallback;
    }
}
//# sourceMappingURL=snapshot.js.map