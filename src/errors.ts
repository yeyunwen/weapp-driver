export type ResolutionKind = "transient" | "ambiguous" | "invalid" | "detached";

export class MiniappAgentError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "MiniappAgentError";
    this.code = code;
  }
}

export class ElementResolutionError extends MiniappAgentError {
  kind: ResolutionKind;

  constructor(message: string, kind: ResolutionKind) {
    super(message, `ELEMENT_${kind.toUpperCase()}`);
    this.name = "ElementResolutionError";
    this.kind = kind;
  }
}

export class OwnershipError extends MiniappAgentError {
  constructor(message: string) {
    super(message, "SESSION_USER_IN_CONTROL");
    this.name = "OwnershipError";
  }
}

export class SessionBusyError extends MiniappAgentError {
  constructor(message: string) {
    super(message, "SESSION_BUSY");
    this.name = "SessionBusyError";
  }
}

export function serializeError(error: unknown) {
  const value = error instanceof Error ? error : new Error(String(error));
  const typed = value as Error & { code?: string; kind?: string };
  return {
    name: value.name,
    message: value.message,
    code: typed.code,
    kind: typed.kind,
    stack: value.stack,
  };
}

export function reviveError(error: NonNullable<import("./types.js").RpcResponse["error"]>) {
  const value = new MiniappAgentError(error.message, error.code);
  value.name = error.name;
  value.stack = error.stack;
  Object.assign(value, error.kind ? { kind: error.kind } : {});
  return value;
}
