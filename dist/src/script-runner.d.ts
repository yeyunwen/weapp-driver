import type { RpcClient } from "./rpc-client.js";
export declare function executeScript(code: string, client: RpcClient, initialProject?: string): Promise<unknown>;
