import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RpcClient } from "./rpc-client.js";
import { clientId, sleep } from "./util.js";
export async function connectToDaemon(socketPath, options = {}) {
    const client = new RpcClient(socketPath, clientId());
    try {
        await client.call("ping");
        return client;
    }
    catch (firstError) {
        client.close();
        if (options.autostart === false)
            throw firstError;
    }
    const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
    const child = spawn(process.execPath, [cliPath, "daemon", "--socket", socketPath], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, WEAPP_DRIVER_DAEMON: "1" },
    });
    child.unref();
    let lastError;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        await sleep(100);
        const retry = new RpcClient(socketPath, clientId());
        try {
            await retry.call("ping");
            return retry;
        }
        catch (error) {
            lastError = error;
            retry.close();
        }
    }
    throw new Error(`Unable to start weapp-driver daemon: ${String(lastError)}`);
}
//# sourceMappingURL=daemon-client.js.map