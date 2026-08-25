export declare function clientId(): string;
export declare function defaultSocketPath(): string;
export declare function resolveProjectPath(input: string): string;
export declare function sleep(ms: number): Promise<void>;
export declare function getByPath(value: unknown, path?: string): unknown;
export declare function tryParseJson(text: string): unknown;
export declare function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
