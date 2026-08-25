import type { RpcClient } from "./rpc-client.js";
import type { SessionOptions, SnapshotOptions, WaitOptions, WechatideCall } from "./types.js";

export type HelperRuntime = ReturnType<typeof createHelperContext>;

export function createHelperContext(client: RpcClient) {
  let currentProject: string | null = null;
  const checks: Array<{ name: string; pass: boolean; evidence?: unknown }> = [];

  const projectParams = (extra: Record<string, unknown> = {}) => {
    if (!currentProject) throw new Error("No active Mini Program project. Call await useProject('/absolute/path') first.");
    return { projectPath: currentProject, ...extra };
  };

  const useProject = async (projectPath: string, options: SessionOptions = {}) => {
    const result = await client.call<{ projectPath: string }>("session.use", { projectPath, options });
    currentProject = result.projectPath;
    return result;
  };

  const claimProject = async (projectPath: string, options: SessionOptions = {}) => {
    const result = await client.call<{ projectPath: string }>("session.claim", { projectPath, options });
    currentProject = result.projectPath;
    return result;
  };

  const handOffProject = async () => {
    const result = await client.call("session.handoff", projectParams());
    currentProject = null;
    return result;
  };

  const completeProject = async (options: { keep: boolean }) => {
    if (typeof options?.keep !== "boolean") throw new Error("completeProject({ keep }) requires an explicit boolean");
    const result = await client.call("session.complete", projectParams({ keep: options.keep }));
    currentProject = null;
    return result;
  };

  const resetProject = async (projectPath?: string) => {
    const target = projectPath || currentProject;
    if (!target) throw new Error("resetProject requires a project path when no project is active");
    const result = await client.call("session.reset", { projectPath: target });
    if (currentProject === target) currentProject = null;
    return result;
  };

  const mini = {
    info: () => client.call("mini.info", projectParams()),
    navigate: (action: "navigateTo" | "redirectTo" | "navigateBack" | "reLaunch" | "switchTab", url?: string) =>
      client.call("mini.navigate", projectParams({ action, url })),
    goto: (url: string) => client.call("mini.navigate", projectParams({ action: "navigateTo", url })),
    reLaunch: (url: string) => client.call("mini.navigate", projectParams({ action: "reLaunch", url })),
    switchTab: (url: string) => client.call("mini.navigate", projectParams({ action: "switchTab", url })),
    back: () => client.call("mini.navigate", projectParams({ action: "navigateBack" })),
    evaluate: (source: string | Function, args: unknown[] = []) =>
      client.call("mini.evaluate", projectParams({ source: source.toString(), args })),
    callWx: (method: string, ...args: unknown[]) => client.call("mini.callWx", projectParams({ method, args })),
    mockWx: (method: string, result: unknown, ...args: unknown[]) =>
      client.call("mini.mockWx", projectParams({ method, result: typeof result === "function" ? result.toString() : result, args })),
    restoreWx: (method: string) => client.call("mini.restoreWx", projectParams({ method })),
    screenshot: (path?: string) => client.call<string>("mini.screenshot", projectParams({ path })),
    scrollTo: (scrollTop: number) => client.call("mini.scrollTo", projectParams({ scrollTop })),
  };

  const page = {
    snapshot: async (options: SnapshotOptions = {}) => {
      const result = await client.call<{ content: string }>("page.snapshot", projectParams({ options }));
      return result.content;
    },
    snapshotRaw: (options: SnapshotOptions = {}) => client.call("page.snapshot", projectParams({ options })),
    query: (selector: string, options: Omit<SnapshotOptions, "selector"> = {}) =>
      client.call("page.query", projectParams({ selector, options })),
    click: (target: string, options: WaitOptions = {}) => client.call("page.click", projectParams({ target, ...options })),
    fill: (target: string, value: string, options: WaitOptions = {}) =>
      client.call("page.fill", projectParams({ target, value, ...options })),
    text: (target: string, options: WaitOptions = {}) => client.call<string>("page.text", projectParams({ target, ...options })),
    value: (target: string, options: WaitOptions = {}) => client.call("page.value", projectParams({ target, ...options })),
    wxml: (target: string, options: WaitOptions = {}) => client.call<string>("page.wxml", projectParams({ target, ...options })),
    attribute: (target: string, name: string, options: WaitOptions = {}) =>
      client.call<string>("page.attribute", projectParams({ target, name, ...options })),
    style: (target: string, name: string, options: WaitOptions = {}) =>
      client.call<string>("page.style", projectParams({ target, name, ...options })),
    data: (path?: string) => client.call("page.data", projectParams({ path })),
    setData: (data: unknown) => client.call("page.setData", projectParams({ data })),
    callMethod: (method: string, ...args: unknown[]) => client.call("page.callMethod", projectParams({ method, args })),
    screenshot: (path?: string) => mini.screenshot(path),
    waitForSelector: (target: string, options: WaitOptions = {}) =>
      client.call("wait.selector", projectParams({ target, ...options })),
    waitForRoute: (route: string, options: WaitOptions = {}) => client.call("wait.route", projectParams({ route, ...options })),
    waitForData: (path: string, expected: unknown, options: WaitOptions = {}) =>
      client.call("wait.data", projectParams({ path, expected, ...options })),
    waitForFunction: (source: string | Function, args: unknown[] = [], options: WaitOptions = {}) =>
      client.call("wait.function", projectParams({ source: source.toString(), args, ...options })),
  };

  const logs = {
    read: (options: { since?: number; type?: "console" | "exception" } = {}) =>
      client.call<Array<{ seq: number; type: string }>>("logs.read", projectParams({ since: options.since ?? 0 })).then((entries) =>
        options.type ? entries.filter((entry) => entry.type === options.type) : entries,
      ),
    errors: (since = 0) =>
      client.call<Array<{ seq: number; type: string }>>("logs.read", projectParams({ since })).then((entries) =>
        entries.filter((entry) => entry.type === "exception" || JSON.stringify(entry).toLowerCase().includes("error")),
      ),
  };

  const devtools = {
    call: (tool: string, args: Record<string, unknown> = {}, options: Omit<WechatideCall, "tool" | "args"> = {}) =>
      client.call("devtools.call", {
        call: {
          tool,
          args: currentProject && args.project === undefined ? { project: currentProject, ...args } : args,
          ...options,
        },
      }),
    refresh: () => devtools.call("simulator_refresh"),
    openPage: (route: string, query?: string) => devtools.call("simulator_open_page", { page: route, query }),
    screenshot: (path?: string) => devtools.call("simulator_screenshot", { path }),
    console: (command = "grep -n .") => devtools.call("get_simulator_console", { command }),
    network: (command = "grep -n .") => devtools.call("get_simulator_network", { command }),
    preview: () => devtools.call("auto_preview"),
    upload: (version: string, description: string) => devtools.call("upload", { uploadVersion: version, desc: description }),
  };

  const recordCheck = (name: string, pass: boolean, evidence?: unknown) => {
    const result = evidence === undefined ? { name, pass } : { name, pass, evidence };
    checks.push(result);
    return result;
  };

  const test = {
    check: (name: string, condition: unknown, evidence?: unknown) => recordCheck(name, Boolean(condition), evidence),
    equal: (name: string, actual: unknown, expected: unknown) =>
      recordCheck(name, Object.is(actual, expected), { actual, expected }),
    match: (name: string, actual: unknown, expected: string | RegExp) => {
      const value = String(actual ?? "");
      const pass = typeof expected === "string" ? value.includes(expected) : expected.test(value);
      return recordCheck(name, pass, { actual, expected: String(expected) });
    },
    report: (evidence: Record<string, unknown> = {}) => ({
      ok: checks.length > 0 && checks.every((check) => check.pass),
      checks: [...checks],
      ...evidence,
    }),
  };

  const helpDocs: Record<string, string> = {
    useProject: "useProject(projectPath, options?) — connect or reuse a persistent miniprogram-automator session.",
    page: "page.snapshot/click/fill/text/data/setData/waitForSelector/waitForRoute/waitForData/waitForFunction/screenshot.",
    mini: "mini.info/navigate/goto/reLaunch/switchTab/back/evaluate/callWx/mockWx/restoreWx/screenshot/scrollTo.",
    logs: "logs.read({since,type?}) and logs.errors(since?) read the persistent console/exception buffer.",
    devtools: "devtools.call(tool,args) uses official wechatide; convenience helpers include refresh/openPage/screenshot/console/network/preview/upload.",
  };

  const help = (name?: string) => (name ? helpDocs[name] || `Unknown helper: ${name}` : Object.entries(helpDocs).map(([key, value]) => `${key}: ${value}`).join("\n"));

  return {
    useProject,
    claimProject,
    handOffProject,
    completeProject,
    resetProject,
    listProjectSessions: () => client.call("session.list"),
    mini,
    page,
    logs,
    devtools,
    test,
    wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    help,
    __release: async () => {
      if (currentProject) await client.call("session.release", projectParams()).catch(() => undefined);
      currentProject = null;
    },
  };
}
