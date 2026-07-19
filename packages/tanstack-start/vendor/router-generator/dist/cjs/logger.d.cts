export interface Logger {
    log: (...args: Array<any>) => void;
    debug: (...args: Array<any>) => void;
    info: (...args: Array<any>) => void;
    warn: (...args: Array<any>) => void;
    error: (...args: Array<any>) => void;
}
export declare function logging(config: {
    disabled: boolean;
}): Logger;
