import type { ManagedSession } from "./session-manager.js";
import type { MiniElement } from "./backend.js";
import type { WaitOptions } from "./types.js";
export declare function resolveElement(session: ManagedSession, target: string, options?: WaitOptions): Promise<MiniElement>;
