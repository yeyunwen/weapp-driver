import type { SessionManager } from "./session-manager.js";
import type { RpcRequest } from "./types.js";
export declare class RpcHandler {
    private readonly sessions;
    constructor(sessions: SessionManager);
    handle(request: RpcRequest): Promise<unknown>;
    releaseClient(clientId: string): void;
    private session;
    private currentPage;
    private miniInfo;
    private miniNavigate;
    private screenshot;
    private snapshot;
    private elementAction;
    private elementRead;
    private waitSelector;
    private waitRoute;
    private waitData;
    private waitFunction;
}
