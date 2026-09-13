export interface EyeDropperOpenOptions {
    signal?: AbortSignal;
}
export interface EyeDropperOpenReturnType {
    sRGBHex: string;
}
export interface UseEyeDropperReturnValue {
    supported: boolean;
    open: (options?: EyeDropperOpenOptions) => Promise<EyeDropperOpenReturnType | undefined>;
}
export declare function useEyeDropper(): UseEyeDropperReturnValue;
