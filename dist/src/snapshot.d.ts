import type { MiniPage } from "./backend.js";
import { RefRegistry } from "./refs.js";
import type { SnapshotOptions, SnapshotResult } from "./types.js";
export declare function captureSemanticSnapshot(page: MiniPage, registry: RefRegistry, options?: SnapshotOptions): Promise<SnapshotResult>;
