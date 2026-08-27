import type { RpcClient } from "./rpc-client.js";
import type { SessionOptions, SnapshotOptions, SnapshotResult, WaitOptions, WechatideCall } from "./types.js";
export type HelperRuntime = ReturnType<typeof createHelperContext>;
export declare function createHelperContext(client: RpcClient): {
    useProject: (projectPath: string, options?: SessionOptions) => Promise<{
        projectPath: string;
    }>;
    claimProject: (projectPath: string, options?: SessionOptions) => Promise<{
        projectPath: string;
    }>;
    handOffProject: () => Promise<unknown>;
    completeProject: (options: {
        keep: boolean;
    }) => Promise<unknown>;
    resetProject: (projectPath?: string) => Promise<unknown>;
    listProjectSessions: () => Promise<unknown>;
    mini: {
        info: () => Promise<unknown>;
        navigate: (action: "navigateTo" | "redirectTo" | "navigateBack" | "reLaunch" | "switchTab", url?: string) => Promise<unknown>;
        goto: (url: string) => Promise<unknown>;
        reLaunch: (url: string) => Promise<unknown>;
        switchTab: (url: string) => Promise<unknown>;
        back: () => Promise<unknown>;
        evaluate: (source: string | Function, args?: unknown[]) => Promise<unknown>;
        callWx: (method: string, ...args: unknown[]) => Promise<unknown>;
        mockWx: (method: string, result: unknown, ...args: unknown[]) => Promise<unknown>;
        restoreWx: (method: string) => Promise<unknown>;
        screenshot: (path?: string) => Promise<string>;
        scrollTo: (scrollTop: number) => Promise<unknown>;
    };
    page: {
        snapshot: (options?: SnapshotOptions) => Promise<string>;
        snapshotRaw: (options?: SnapshotOptions) => Promise<unknown>;
        query: (selector: string, options?: Omit<SnapshotOptions, "selector">) => Promise<SnapshotResult>;
        count: (selector: string) => Promise<number>;
        exists: (selector: string) => Promise<boolean>;
        click: (target: string, options?: WaitOptions) => Promise<unknown>;
        fill: (target: string, value: string, options?: WaitOptions) => Promise<unknown>;
        text: (target: string, options?: WaitOptions) => Promise<string>;
        value: (target: string, options?: WaitOptions) => Promise<unknown>;
        wxml: (target: string, options?: WaitOptions) => Promise<string>;
        attribute: (target: string, name: string, options?: WaitOptions) => Promise<string>;
        property: (target: string, name: string, options?: WaitOptions) => Promise<unknown>;
        style: (target: string, name: string, options?: WaitOptions) => Promise<string>;
        data: (path?: string) => Promise<unknown>;
        setData: (data: unknown) => Promise<unknown>;
        callMethod: (method: string, ...args: unknown[]) => Promise<unknown>;
        screenshot: (path?: string) => Promise<string>;
        waitForSelector: (target: string, options?: WaitOptions) => Promise<unknown>;
        waitForRoute: (route: string, options?: WaitOptions) => Promise<unknown>;
        waitForData: (path: string, expected: unknown, options?: WaitOptions) => Promise<unknown>;
        waitForFunction: (source: string | Function, args?: unknown[], options?: WaitOptions) => Promise<unknown>;
    };
    component: {
        query: (target: string, selector: string, options?: Omit<SnapshotOptions, "selector"> & WaitOptions) => Promise<SnapshotResult>;
        data: (target: string, path?: string, options?: WaitOptions) => Promise<unknown>;
        property: (target: string, name: string, options?: WaitOptions) => Promise<unknown>;
        setData: (target: string, data: unknown, options?: WaitOptions) => Promise<unknown>;
        callMethod: (target: string, method: string, args?: unknown[], options?: WaitOptions) => Promise<unknown>;
    };
    logs: {
        read: (options?: {
            since?: number;
            type?: "console" | "exception";
        }) => Promise<{
            seq: number;
            type: string;
        }[]>;
        errors: (since?: number) => Promise<{
            seq: number;
            type: string;
        }[]>;
    };
    devtools: {
        call: (tool: string, args?: Record<string, unknown>, options?: Omit<WechatideCall, "tool" | "args">) => Promise<unknown>;
        refresh: () => Promise<unknown>;
        openPage: (route: string, query?: string) => Promise<unknown>;
        screenshot: (path?: string) => Promise<unknown>;
        console: (command?: string) => Promise<unknown>;
        network: (command?: string) => Promise<unknown>;
        preview: () => Promise<unknown>;
        upload: (version: string, description: string) => Promise<unknown>;
    };
    test: {
        check: (name: string, condition: unknown, evidence?: unknown) => {
            name: string;
            pass: boolean;
            evidence?: undefined;
        } | {
            name: string;
            pass: boolean;
            evidence: {} | null;
        };
        equal: (name: string, actual: unknown, expected: unknown) => {
            name: string;
            pass: boolean;
            evidence?: undefined;
        } | {
            name: string;
            pass: boolean;
            evidence: {} | null;
        };
        match: (name: string, actual: unknown, expected: string | RegExp) => {
            name: string;
            pass: boolean;
            evidence?: undefined;
        } | {
            name: string;
            pass: boolean;
            evidence: {} | null;
        };
        report: (evidence?: Record<string, unknown>) => {
            ok: boolean;
            checks: {
                name: string;
                pass: boolean;
                evidence?: unknown;
            }[];
        };
    };
    wait: (ms: number) => Promise<void>;
    help: (name?: string) => string;
    __release: () => Promise<void>;
};
