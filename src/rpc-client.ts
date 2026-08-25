import { connect, type Socket } from "node:net";

import { reviveError } from "./errors.js";
import type { RpcRequest, RpcResponse } from "./types.js";

export class RpcClient {
  private socket: Socket | null = null;
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void }>();

  constructor(private readonly socketPath: string, readonly clientId: string) {}

  async open() {
    if (this.socket) return;
    this.socket = await new Promise<Socket>((resolve, reject) => {
      const socket = connect(this.socketPath);
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    });
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(String(chunk)));
    this.socket.on("close", () => this.rejectAll(new Error("weapp-driver daemon connection closed")));
    this.socket.on("error", (error) => this.rejectAll(error));
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    await this.open();
    const id = this.nextId++;
    const request: RpcRequest = { id, clientId: this.clientId, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.socket?.write(`${JSON.stringify(request)}\n`);
    });
  }

  close() {
    this.socket?.end();
    this.socket = null;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const response = JSON.parse(line) as RpcResponse;
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      if (response.error) pending.reject(reviveError(response.error));
      else pending.resolve(response.result);
    }
  }

  private rejectAll(error: unknown) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
