import { createServer, type Server, type Socket } from "node:net";
import { chmod, unlink } from "node:fs/promises";

import { AutomatorBackendFactory } from "./automator-backend.js";
import type { BackendFactory } from "./backend.js";
import { serializeError } from "./errors.js";
import { RpcHandler } from "./rpc-handler.js";
import { SessionManager } from "./session-manager.js";
import type { RpcRequest, RpcResponse } from "./types.js";

export class MiniappAgentDaemon {
  private readonly sessions: SessionManager;
  private readonly handler: RpcHandler;
  private server: Server | null = null;

  constructor(private readonly socketPath: string, factory: BackendFactory = new AutomatorBackendFactory()) {
    this.sessions = new SessionManager(factory);
    this.handler = new RpcHandler(this.sessions);
  }

  async start() {
    await unlink(this.socketPath).catch(() => undefined);
    this.server = createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.socketPath, resolve);
    });
    await chmod(this.socketPath, 0o600);
  }

  async stop() {
    await this.sessions.closeAll();
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = null;
    }
    await unlink(this.socketPath).catch(() => undefined);
  }

  private accept(socket: Socket) {
    socket.setEncoding("utf8");
    let buffer = "";
    const clientIds = new Set<string>();
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        void this.dispatch(socket, line, clientIds);
      }
    });
    socket.on("close", () => {
      for (const id of clientIds) this.handler.releaseClient(id);
    });
  }

  private async dispatch(socket: Socket, line: string, clientIds: Set<string>) {
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
      clientIds.add(request.clientId);
    } catch (error) {
      socket.write(`${JSON.stringify({ id: -1, error: serializeError(error) } satisfies RpcResponse)}\n`);
      return;
    }
    try {
      const result = await this.handler.handle(request);
      socket.write(`${JSON.stringify({ id: request.id, result } satisfies RpcResponse)}\n`);
    } catch (error) {
      socket.write(`${JSON.stringify({ id: request.id, error: serializeError(error) } satisfies RpcResponse)}\n`);
    }
  }
}
