import type { ManagedSession } from "./session-manager.js";
import type { MiniElement, MiniPage } from "./backend.js";
import { ElementResolutionError } from "./errors.js";
import type { WaitOptions } from "./types.js";
import { sleep } from "./util.js";

export async function resolveElement(session: ManagedSession, target: string, options: WaitOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (true) {
    try {
      return await resolveOnce(session, target);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ElementResolutionError) || error.kind !== "transient" || Date.now() >= deadline) {
        throw error;
      }
      await sleep(intervalMs);
    }
    if (Date.now() >= deadline) throw lastError;
  }
}

async function resolveOnce(session: ManagedSession, target: string): Promise<MiniElement> {
  const ref = session.registry.resolve(target);
  if (ref) return ref;
  const page = await currentPage(session);
  if (target.startsWith("loc=css:")) return unique(page, target.slice("loc=css:".length));
  if (target.startsWith("css=")) return unique(page, target.slice(4));
  if (target.startsWith("text=")) return byText(page, target.slice(5));
  if (target.startsWith("loc=role:")) return byRole(page, target.slice("loc=role:".length));
  return unique(page, target);
}

async function unique(page: MiniPage, selector: string) {
  if (!selector.trim()) throw new ElementResolutionError("Selector cannot be empty", "invalid");
  let elements: MiniElement[];
  try {
    elements = await page.$$(selector);
  } catch (error) {
    throw new ElementResolutionError(`Invalid selector ${JSON.stringify(selector)}: ${String(error)}`, "invalid");
  }
  if (elements.length === 0) throw new ElementResolutionError(`Selector matched no elements: ${selector}`, "transient");
  if (elements.length > 1) throw new ElementResolutionError(`Selector matched ${elements.length} elements: ${selector}`, "ambiguous");
  return elements[0] as MiniElement;
}

async function byText(page: MiniPage, expected: string) {
  const elements = await page.$$("*");
  const matches: MiniElement[] = [];
  for (const element of elements) {
    const text = await element.text().catch(() => "");
    if (normalize(text).includes(normalize(expected))) matches.push(element);
  }
  if (matches.length === 0) throw new ElementResolutionError(`No element contains text ${JSON.stringify(expected)}`, "transient");
  if (matches.length > 1) throw new ElementResolutionError(`Text matched ${matches.length} elements: ${JSON.stringify(expected)}`, "ambiguous");
  return matches[0] as MiniElement;
}

async function byRole(page: MiniPage, expression: string) {
  const match = /^([^\[]+)(?:\[name=(?:"([^"]*)"|'([^']*)')\])?$/.exec(expression.trim());
  if (!match) throw new ElementResolutionError(`Invalid role locator: ${expression}`, "invalid");
  const role = match[1]?.trim() || "";
  const name = match[2] ?? match[3];
  const tags = roleTags(role);
  const elements: MiniElement[] = [];
  for (const tag of tags) elements.push(...(await page.$$(tag)));
  const matches = name
    ? (await Promise.all(elements.map(async (element) => ({ element, text: await element.text().catch(() => "") })))).filter(
        (entry) => normalize(entry.text) === normalize(name),
      ).map((entry) => entry.element)
    : elements;
  if (matches.length === 0) throw new ElementResolutionError(`Role locator matched no elements: ${expression}`, "transient");
  if (matches.length > 1) throw new ElementResolutionError(`Role locator matched ${matches.length} elements: ${expression}`, "ambiguous");
  return matches[0] as MiniElement;
}

function roleTags(role: string) {
  switch (role.toLowerCase()) {
    case "button":
      return ["button"];
    case "textbox":
      return ["input", "textarea"];
    case "image":
      return ["image"];
    case "link":
      return ["navigator"];
    default:
      return [role];
  }
}

async function currentPage(session: ManagedSession) {
  const page = await session.backend.currentPage();
  if (!page) throw new Error("Mini Program has no current page");
  return page;
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
