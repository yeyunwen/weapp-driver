export function createHelperContext(client) {
    let currentProject = null;
    const checks = [];
    const projectParams = (extra = {}) => {
        if (!currentProject)
            throw new Error("No active Mini Program project. Call await useProject('/absolute/path') first.");
        return { projectPath: currentProject, ...extra };
    };
    const useProject = async (projectPath, options = {}) => {
        const result = await client.call("session.use", { projectPath, options });
        currentProject = result.projectPath;
        return result;
    };
    const claimProject = async (projectPath, options = {}) => {
        const result = await client.call("session.claim", { projectPath, options });
        currentProject = result.projectPath;
        return result;
    };
    const handOffProject = async () => {
        const result = await client.call("session.handoff", projectParams());
        currentProject = null;
        return result;
    };
    const completeProject = async (options) => {
        if (typeof options?.keep !== "boolean")
            throw new Error("completeProject({ keep }) requires an explicit boolean");
        const result = await client.call("session.complete", projectParams({ keep: options.keep }));
        currentProject = null;
        return result;
    };
    const resetProject = async (projectPath) => {
        const target = projectPath || currentProject;
        if (!target)
            throw new Error("resetProject requires a project path when no project is active");
        const result = await client.call("session.reset", { projectPath: target });
        if (currentProject === target)
            currentProject = null;
        return result;
    };
    const mini = {
        info: () => client.call("mini.info", projectParams()),
        navigate: (action, url) => client.call("mini.navigate", projectParams({ action, url })),
        goto: (url) => client.call("mini.navigate", projectParams({ action: "navigateTo", url })),
        reLaunch: (url) => client.call("mini.navigate", projectParams({ action: "reLaunch", url })),
        switchTab: (url) => client.call("mini.navigate", projectParams({ action: "switchTab", url })),
        back: () => client.call("mini.navigate", projectParams({ action: "navigateBack" })),
        evaluate: (source, args = []) => client.call("mini.evaluate", projectParams({ source: source.toString(), args })),
        callWx: (method, ...args) => client.call("mini.callWx", projectParams({ method, args })),
        mockWx: (method, result, ...args) => client.call("mini.mockWx", projectParams({ method, result: typeof result === "function" ? result.toString() : result, args })),
        restoreWx: (method) => client.call("mini.restoreWx", projectParams({ method })),
        screenshot: (path) => client.call("mini.screenshot", projectParams({ path })),
        scrollTo: (scrollTop) => client.call("mini.scrollTo", projectParams({ scrollTop })),
    };
    const page = {
        snapshot: async (options = {}) => {
            const result = await client.call("page.snapshot", projectParams({ options }));
            return result.content;
        },
        snapshotRaw: (options = {}) => client.call("page.snapshot", projectParams({ options })),
        query: (selector, options = {}) => client.call("page.query", projectParams({ selector, options })),
        count: (selector) => client.call("page.count", projectParams({ selector })),
        exists: (selector) => client.call("page.exists", projectParams({ selector })),
        click: (target, options = {}) => client.call("page.click", projectParams({ target, ...options })),
        fill: (target, value, options = {}) => client.call("page.fill", projectParams({ target, value, ...options })),
        text: (target, options = {}) => client.call("page.text", projectParams({ target, ...options })),
        value: (target, options = {}) => client.call("page.value", projectParams({ target, ...options })),
        wxml: (target, options = {}) => client.call("page.wxml", projectParams({ target, ...options })),
        attribute: (target, name, options = {}) => client.call("page.attribute", projectParams({ target, name, ...options })),
        property: (target, name, options = {}) => client.call("element.property", projectParams({ target, name, ...options })),
        style: (target, name, options = {}) => client.call("page.style", projectParams({ target, name, ...options })),
        data: (path) => client.call("page.data", projectParams({ path })),
        setData: (data) => client.call("page.setData", projectParams({ data })),
        callMethod: (method, ...args) => client.call("page.callMethod", projectParams({ method, args })),
        screenshot: (path) => mini.screenshot(path),
        waitForSelector: (target, options = {}) => client.call("wait.selector", projectParams({ target, ...options })),
        waitForRoute: (route, options = {}) => client.call("wait.route", projectParams({ route, ...options })),
        waitForData: (path, expected, options = {}) => client.call("wait.data", projectParams({ path, expected, ...options })),
        waitForFunction: (source, args = [], options = {}) => client.call("wait.function", projectParams({ source: source.toString(), args, ...options })),
    };
    const component = {
        query: (target, selector, options = {}) => {
            const { timeoutMs, intervalMs, ...snapshotOptions } = options;
            return client.call("component.query", projectParams({
                target,
                selector,
                options: snapshotOptions,
                ...(timeoutMs === undefined ? {} : { timeoutMs }),
                ...(intervalMs === undefined ? {} : { intervalMs }),
            }));
        },
        data: (target, path, options = {}) => client.call("component.data", projectParams({ target, path, ...options })),
        property: (target, name, options = {}) => client.call("element.property", projectParams({ target, name, ...options })),
        setData: (target, data, options = {}) => client.call("component.setData", projectParams({ target, data, ...options })),
        callMethod: (target, method, args = [], options = {}) => client.call("component.callMethod", projectParams({ target, method, args, ...options })),
    };
    const logs = {
        read: (options = {}) => client.call("logs.read", projectParams({ since: options.since ?? 0 })).then((entries) => options.type ? entries.filter((entry) => entry.type === options.type) : entries),
        errors: (since = 0) => client.call("logs.read", projectParams({ since })).then((entries) => entries.filter((entry) => entry.type === "exception" || JSON.stringify(entry).toLowerCase().includes("error"))),
    };
    const devtools = {
        call: (tool, args = {}, options = {}) => client.call("devtools.call", {
            call: {
                tool,
                args: currentProject && args.project === undefined ? { project: currentProject, ...args } : args,
                ...options,
            },
        }),
        refresh: () => devtools.call("simulator_refresh"),
        openPage: (route, query) => devtools.call("simulator_open_page", { page: route, query }),
        screenshot: (path) => devtools.call("simulator_screenshot", { path }),
        console: (command = "grep -n .") => devtools.call("get_simulator_console", { command }),
        network: (command = "grep -n .") => devtools.call("get_simulator_network", { command }),
        preview: () => devtools.call("auto_preview"),
        upload: (version, description) => devtools.call("upload", { uploadVersion: version, desc: description }),
    };
    const recordCheck = (name, pass, evidence) => {
        const result = evidence === undefined ? { name, pass } : { name, pass, evidence };
        checks.push(result);
        return result;
    };
    const test = {
        check: (name, condition, evidence) => recordCheck(name, Boolean(condition), evidence),
        equal: (name, actual, expected) => recordCheck(name, Object.is(actual, expected), { actual, expected }),
        match: (name, actual, expected) => {
            const value = String(actual ?? "");
            const pass = typeof expected === "string" ? value.includes(expected) : expected.test(value);
            return recordCheck(name, pass, { actual, expected: String(expected) });
        },
        report: (evidence = {}) => ({
            ok: checks.length > 0 && checks.every((check) => check.pass),
            checks: [...checks],
            ...evidence,
        }),
    };
    const helpDocs = {
        useProject: "useProject(projectPath, options?) — connect or reuse a persistent miniprogram-automator session.",
        page: "page.snapshot/query/exists/count/click/fill/text/property/data/setData/waitForSelector/waitForRoute/waitForData/waitForFunction/screenshot.",
        component: "component.query/property/data/setData/callMethod inspect and operate custom components.",
        mini: "mini.info/navigate/goto/reLaunch/switchTab/back/evaluate/callWx/mockWx/restoreWx/screenshot/scrollTo.",
        logs: "logs.read({since,type?}) and logs.errors(since?) read the persistent console/exception buffer.",
        devtools: "devtools.call(tool,args) uses official wechatide; convenience helpers include refresh/openPage/screenshot/console/network/preview/upload.",
    };
    const help = (name) => (name ? helpDocs[name] || `Unknown helper: ${name}` : Object.entries(helpDocs).map(([key, value]) => `${key}: ${value}`).join("\n"));
    return {
        useProject,
        claimProject,
        handOffProject,
        completeProject,
        resetProject,
        listProjectSessions: () => client.call("session.list"),
        mini,
        page,
        component,
        logs,
        devtools,
        test,
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        help,
        __release: async () => {
            if (currentProject)
                await client.call("session.release", projectParams()).catch(() => undefined);
            currentProject = null;
        },
    };
}
//# sourceMappingURL=helpers.js.map