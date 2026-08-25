export declare class RpcClient {
    private readonly socketPath;
    readonly clientId: string;
    private socket;
    private nextId;
    private buffer;
    private readonly pending;
    constructor(socketPath: string, clientId: string);
    open(): Promise<void>;
    call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    close(): void;
    private onData;
    private rejectAll;
}
