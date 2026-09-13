export interface UseMaskOptions {
    /** Mask pattern string or array of string literals and RegExp objects */
    mask: string | Array<string | RegExp>;
    /** Override or extend the default token map */
    tokens?: Record<string, RegExp>;
    /** Called before masking on each keystroke, can return overrides for mask options */
    modify?: (value: string) => Partial<Pick<UseMaskOptions, 'mask' | 'tokens' | 'slotChar' | 'separate'>> | undefined;
    /** When true, raw and display values are decoupled */
    separate?: boolean;
    /** Character displayed in unfilled slots, `"_"` by default */
    slotChar?: string | null;
    /** Show mask pattern even when field is empty and unfocused */
    alwaysShowMask?: boolean;
    /** Show mask placeholder on focus, `true` by default */
    showMaskOnFocus?: boolean;
    /** Transform each character before validation and insertion */
    transform?: (char: string) => string;
    /** Clear value on blur when mask is incomplete, `false` by default */
    autoClear?: boolean;
    /** Sets aria-invalid on the input */
    invalid?: boolean;
    /** Called on every change with raw and masked values */
    onChangeRaw?: (rawValue: string, maskedValue: string) => void;
    /** Called when all required mask slots are filled */
    onComplete?: (maskedValue: string, rawValue: string) => void;
    /** Escape hatch for advanced cursor/value manipulation */
    beforeMaskedStateChange?: (states: {
        previousState: MaskState;
        currentState: MaskState;
        nextState: MaskState;
    }) => MaskState;
}
export interface MaskState {
    value: string;
    selection: {
        start: number;
        end: number;
    } | null;
}
export interface UseMaskReturnValue {
    /** Ref to attach to the input element */
    ref: React.RefCallback<HTMLInputElement>;
    /** Current masked display value */
    value: string;
    /** Current raw unmasked value */
    rawValue: string;
    /** Whether all required mask slots are filled */
    isComplete: boolean;
    /** Clear the input value and reset state */
    reset: () => void;
}
export declare function formatMask(raw: string, options: UseMaskOptions): string;
export declare function unformatMask(masked: string, options: UseMaskOptions): string;
export declare function isMaskComplete(masked: string, options: UseMaskOptions): boolean;
export declare function generatePattern(mode: 'full' | 'full-inexact', options: UseMaskOptions): string;
export declare function useMask(options: UseMaskOptions): UseMaskReturnValue;
export declare namespace useMask {
    type Options = UseMaskOptions;
    type ReturnValue = UseMaskReturnValue;
}
