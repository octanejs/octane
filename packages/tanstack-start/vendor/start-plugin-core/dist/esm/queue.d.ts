interface PoolConfig {
    concurrency?: number;
    started?: boolean;
    tasks?: Array<() => Promise<any>>;
}
export declare class Queue<T> {
    private onSettles;
    private onErrors;
    private onSuccesses;
    private running;
    private active;
    private pending;
    private currentConcurrency;
    constructor(config?: PoolConfig);
    private tick;
    add(fn: () => Promise<T> | T, { priority }?: {
        priority?: boolean;
    }): Promise<any>;
    throttle(n: number): void;
    onSettled(cb: () => void): () => void;
    onError(cb: (error: any, task: () => Promise<any>) => void): () => void;
    onSuccess(cb: (result: any, task: () => Promise<any>) => void): () => void;
    stop(): void;
    start(): Promise<void>;
    clear(): void;
    getActive(): (() => Promise<any>)[];
    getPending(): (() => Promise<any>)[];
    getAll(): (() => Promise<any>)[];
    isRunning(): boolean;
    isSettled(): boolean;
}
export {};
