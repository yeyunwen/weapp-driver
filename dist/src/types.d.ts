export type Ownership = "agent" | "user";
export type SessionOptions = {
    wsEndpoint?: string;
    cliPath?: string;
    port?: number;
    account?: string;
    ticket?: string;
    trustProject?: boolean;
    args?: string[];
    cwd?: string;
};
export type SessionSummary = {
    projectPath: string;
    ownership: Ownership;
    connectedAt: string;
    lastUsedAt: string;
    activeClientId: string | null;
    currentPage?: PageSummary | null;
};
export type PageSummary = {
    path: string;
    query: Record<string, unknown>;
};
export type ElementSummary = {
    ref: string;
    tag: string;
    text: string;
    locator?: string;
    attributes: Record<string, string>;
    opaqueAttributes?: string[];
    box?: LayoutBox;
};
export type LayoutBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type SnapshotOptions = {
    selector?: string;
    includeLayout?: boolean;
    maxElements?: number;
    concurrency?: number;
};
export type SnapshotResult = {
    content: string;
    refs: ElementSummary[];
    page: PageSummary;
    capturedAt: string;
};
export type ConsoleEntry = {
    seq: number;
    time: string;
    type: "console" | "exception";
    payload: unknown;
};
export type WaitOptions = {
    timeoutMs?: number;
    intervalMs?: number;
};
export type RpcRequest = {
    id: number;
    clientId: string;
    method: string;
    params?: Record<string, unknown>;
};
export type RpcResponse = {
    id: number;
    result?: unknown;
    error?: {
        name: string;
        message: string;
        code?: string;
        kind?: string;
        stack?: string;
    };
};
export type WechatideCall = {
    tool: string;
    args?: Record<string, unknown>;
    clientName?: string;
    token?: string;
    timeoutMs?: number;
};
