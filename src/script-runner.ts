import { createHelperContext } from "./helpers.js";
import type { RpcClient } from "./rpc-client.js";

export async function executeScript(code: string, client: RpcClient, initialProject?: string) {
  const context = createHelperContext(client);
  const exposed = Object.fromEntries(Object.entries(context).filter(([name]) => !name.startsWith("__")));
  if (initialProject) await context.useProject(initialProject);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;
  const names = Object.keys(exposed);
  const values = Object.values(exposed);
  const fn = new AsyncFunction(...names, `"use strict";\n${code}`);
  try {
    return await fn(...values);
  } finally {
    await context.__release();
  }
}
