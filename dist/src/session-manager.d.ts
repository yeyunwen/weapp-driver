import type { BackendFactory, MiniSessionBackend } from "./backend.js";
import { RefRegistry } from "./refs.js";
import type { Ownership, SessionOptions, SessionSummary } from "./types.js";
export type ManagedSession = {
    projectPath: string;
    backend: MiniSessionBackend;
    registry: RefRegistry;
    ownership: Ownership;
    activeClientId: string | null;
    connectedAt: Date;
    lastUsedAt: Date;
};
export declare class SessionManager {
    private readonly factory;
    private readonly sessions;
    constructor(factory: BackendFactory);
    use(projectInput: string, options: SessionOptions, clientId: string, force?: boolean): Promise<SessionSummary>;
    require(projectInput: string, clientId: string): ManagedSession;
    list(): Promise<SessionSummary[]>;
    release(projectInput: string, clientId: string): void;
    releaseClient(clientId: string): void;
    handoff(projectInput: string, clientId: string): {
        done: boolean;
        projectPath: string;
        ownership: "user";
    };
    complete(projectInput: string, clientId: string, keep: boolean): Promise<{
        done: boolean;
        kept: boolean;
        projectPath: string;
    }>;
    reset(projectInput: string, clientId: string): Promise<{
        done: boolean;
        existed: boolean;
        projectPath: string;
    }>;
    closeAll(): Promise<void>;
    private summary;
}
