export interface UseClipboardInput {
    /** Time in ms after which the copied state will reset, `2000` by default */
    timeout?: number;
}
export interface UseClipboardReturnValue {
    /** Function to copy value to clipboard */
    copy: (value: any) => void;
    /** Function to reset copied state and error */
    reset: () => void;
    /** Error if copying failed */
    error: Error | null;
    /** Boolean indicating if the value was copied successfully */
    copied: boolean;
}
export declare function useClipboard(options?: UseClipboardInput): UseClipboardReturnValue;
export declare namespace useClipboard {
    type Input = UseClipboardInput;
    type ReturnValue = UseClipboardReturnValue;
}
