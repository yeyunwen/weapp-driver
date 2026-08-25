export class WeAppDriverError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = "WeAppDriverError";
        this.code = code;
    }
}
export class ElementResolutionError extends WeAppDriverError {
    kind;
    constructor(message, kind) {
        super(message, `ELEMENT_${kind.toUpperCase()}`);
        this.name = "ElementResolutionError";
        this.kind = kind;
    }
}
export class OwnershipError extends WeAppDriverError {
    constructor(message) {
        super(message, "SESSION_USER_IN_CONTROL");
        this.name = "OwnershipError";
    }
}
export class SessionBusyError extends WeAppDriverError {
    constructor(message) {
        super(message, "SESSION_BUSY");
        this.name = "SessionBusyError";
    }
}
export function serializeError(error) {
    const value = error instanceof Error ? error : new Error(String(error));
    const typed = value;
    return {
        name: value.name,
        message: value.message,
        code: typed.code,
        kind: typed.kind,
        stack: value.stack,
    };
}
export function reviveError(error) {
    const value = new WeAppDriverError(error.message, error.code);
    value.name = error.name;
    value.stack = error.stack;
    Object.assign(value, error.kind ? { kind: error.kind } : {});
    return value;
}
//# sourceMappingURL=errors.js.map