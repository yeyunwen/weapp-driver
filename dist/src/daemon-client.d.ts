import { RpcClient } from "./rpc-client.js";
export declare function connectToDaemon(socketPath: string, options?: {
    autostart?: boolean;
}): Promise<RpcClient>;
