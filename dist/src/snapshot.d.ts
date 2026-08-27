import type { MiniElement, MiniPage } from "./backend.js";
import { RefRegistry } from "./refs.js";
import type { SnapshotOptions, SnapshotResult } from "./types.js";
export declare function captureSemanticSnapshot(page: MiniPage, registry: RefRegistry, options?: SnapshotOptions): Promise<SnapshotResult>;
export declare function captureSemanticElements(page: Pick<MiniPage, "path" | "query">, allElements: MiniElement[], registry: RefRegistry, options?: SnapshotOptions, maxElements?: number): Promise<SnapshotResult>;
