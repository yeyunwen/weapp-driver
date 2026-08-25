export type ResolutionKind = "transient" | "ambiguous" | "invalid" | "detached";
export declare class WeAppDriverError extends Error {
    code?: string;
    constructor(message: string, code?: string);
}
export declare class ElementResolutionError extends WeAppDriverError {
    kind: ResolutionKind;
    constructor(message: string, kind: ResolutionKind);
}
export declare class OwnershipError extends WeAppDriverError {
    constructor(message: string);
}
export declare class SessionBusyError extends WeAppDriverError {
    constructor(message: string);
}
export declare function serializeError(error: unknown): {
    name: string;
    message: string;
    code: string | undefined;
    kind: string | undefined;
    stack: string | undefined;
};
export declare function reviveError(error: NonNullable<import("./types.js").RpcResponse["error"]>): WeAppDriverError;
