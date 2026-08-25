import { connect } from "node:net";
import { reviveError } from "./errors.js";
export class RpcClient {
    socketPath;
    clientId;
    socket = null;
    nextId = 1;
    buffer = "";
    pending = new Map();
    constructor(socketPath, clientId) {
        this.socketPath = socketPath;
        this.clientId = clientId;
    }
    async open() {
        if (this.socket)
            return;
        this.socket = await new Promise((resolve, reject) => {
            const socket = connect(this.socketPath);
            socket.once("connect", () => resolve(socket));
            socket.once("error", reject);
        });
        this.socket.setEncoding("utf8");
        this.socket.on("data", (chunk) => this.onData(String(chunk)));
        this.socket.on("close", () => this.rejectAll(new Error("weapp-driver daemon connection closed")));
        this.socket.on("error", (error) => this.rejectAll(error));
    }
    async call(method, params = {}) {
        await this.open();
        const id = this.nextId++;
        const request = { id, clientId: this.clientId, method, params };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve: (value) => resolve(value), reject });
            this.socket?.write(`${JSON.stringify(request)}\n`);
        });
    }
    close() {
        this.socket?.end();
        this.socket = null;
    }
    onData(chunk) {
        this.buffer += chunk;
        while (true) {
            const newline = this.buffer.indexOf("\n");
            if (newline < 0)
                break;
            const line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            if (!line.trim())
                continue;
            const response = JSON.parse(line);
            const pending = this.pending.get(response.id);
            if (!pending)
                continue;
            this.pending.delete(response.id);
            if (response.error)
                pending.reject(reviveError(response.error));
            else
                pending.resolve(response.result);
        }
    }
    rejectAll(error) {
        for (const pending of this.pending.values())
            pending.reject(error);
        this.pending.clear();
    }
}
//# sourceMappingURL=rpc-client.js.map