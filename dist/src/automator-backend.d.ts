import type { BackendFactory, MiniSessionBackend } from "./backend.js";
import type { SessionOptions } from "./types.js";
export declare class AutomatorBackendFactory implements BackendFactory {
    connect(projectPath: string, options: SessionOptions): Promise<MiniSessionBackend>;
}
