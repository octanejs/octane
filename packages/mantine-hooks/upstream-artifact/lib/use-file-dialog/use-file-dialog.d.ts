export interface UseFileDialogOptions {
    /** Determines whether multiple files are allowed, `true` by default */
    multiple?: boolean;
    /** `accept` attribute of the file input, '*' by default */
    accept?: string;
    /** `capture` attribute of the file input */
    capture?: string;
    /** Determines whether the user can pick a directory instead of file, `false` by default */
    directory?: boolean;
    /** Determines whether the file input state should be reset when the file dialog is opened, `false` by default */
    resetOnOpen?: boolean;
    /** Initial selected files */
    initialFiles?: FileList | File[];
    /** Called when files are selected */
    onChange?: (files: FileList | null) => void;
    /** Called when file dialog is canceled */
    onCancel?: () => void;
}
export interface UseFileDialogReturnValue {
    files: FileList | null;
    open: () => void;
    reset: () => void;
}
export declare function useFileDialog(input?: UseFileDialogOptions): UseFileDialogReturnValue;
export declare namespace useFileDialog {
    type Options = UseFileDialogOptions;
    type ReturnValue = UseFileDialogReturnValue;
}
