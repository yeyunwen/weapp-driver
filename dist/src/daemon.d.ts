import type { BackendFactory } from "./backend.js";
export declare class WeAppDriverDaemon {
    private readonly socketPath;
    private readonly sessions;
    private readonly handler;
    private server;
    constructor(socketPath: string, factory?: BackendFactory);
    start(): Promise<void>;
    stop(): Promise<void>;
    private accept;
    private dispatch;
}
