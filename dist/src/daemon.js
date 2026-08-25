import { createServer } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import { AutomatorBackendFactory } from "./automator-backend.js";
import { serializeError } from "./errors.js";
import { RpcHandler } from "./rpc-handler.js";
import { SessionManager } from "./session-manager.js";
export class WeAppDriverDaemon {
    socketPath;
    sessions;
    handler;
    server = null;
    constructor(socketPath, factory = new AutomatorBackendFactory()) {
        this.socketPath = socketPath;
        this.sessions = new SessionManager(factory);
        this.handler = new RpcHandler(this.sessions);
    }
    async start() {
        await unlink(this.socketPath).catch(() => undefined);
        this.server = createServer((socket) => this.accept(socket));
        await new Promise((resolve, reject) => {
            this.server?.once("error", reject);
            this.server?.listen(this.socketPath, resolve);
        });
        await chmod(this.socketPath, 0o600);
    }
    async stop() {
        await this.sessions.closeAll();
        if (this.server) {
            await new Promise((resolve) => this.server?.close(() => resolve()));
            this.server = null;
        }
        await unlink(this.socketPath).catch(() => undefined);
    }
    accept(socket) {
        socket.setEncoding("utf8");
        let buffer = "";
        const clientIds = new Set();
        socket.on("data", (chunk) => {
            buffer += chunk;
            while (true) {
                const newline = buffer.indexOf("\n");
                if (newline < 0)
                    break;
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (!line.trim())
                    continue;
                void this.dispatch(socket, line, clientIds);
            }
        });
        socket.on("close", () => {
            for (const id of clientIds)
                this.handler.releaseClient(id);
        });
    }
    async dispatch(socket, line, clientIds) {
        let request;
        try {
            request = JSON.parse(line);
            clientIds.add(request.clientId);
        }
        catch (error) {
            socket.write(`${JSON.stringify({ id: -1, error: serializeError(error) })}\n`);
            return;
        }
        try {
            const result = await this.handler.handle(request);
            socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
        }
        catch (error) {
            socket.write(`${JSON.stringify({ id: request.id, error: serializeError(error) })}\n`);
        }
    }
}
//# sourceMappingURL=daemon.js.map