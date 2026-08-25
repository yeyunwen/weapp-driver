import type { MiniElement } from "./backend.js";
export declare class RefRegistry {
    private readonly objectRefs;
    private readonly elements;
    private latest;
    private nextRef;
    hasSnapshot(): boolean;
    beginSnapshot(): void;
    register(element: MiniElement): string;
    resolve(target: string): MiniElement | null;
}
