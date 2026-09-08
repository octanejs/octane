import { FileWithPath } from "file-selector";
import * as React from "react";
//#region src/utils/index.d.ts
/**
 * A map of accepted MIME types to file extensions, as passed to the `accept` prop.
 *
 * An extension value may be a single extension string or an array of them - both are
 * accepted, mirroring the shape of `window.showOpenFilePicker`'s `accept`.
 */
interface Accept {
  [key: string]: string | readonly string[];
}
/**
 * A labeled group of accepted types, mirroring one entry of `window.showOpenFilePicker`'s
 * `types` option. Passing the `accept` prop as an array of these lets the File System Access
 * picker present multiple named filter rows instead of a single one (see
 * {@link pickerOptionsFromAccept}). The optional `description` labels the row; when omitted it
 * is derived from the group's extensions.
 *
 * Grouping only surfaces when the FS Access picker is actually used (`useFsAccessApi` +
 * a secure context + browser support). The native `<input>` fallback has no concept of groups
 * or descriptions, so every group is flattened into one accept attribute there.
 */
interface AcceptGroup {
  description?: string;
  accept: Accept;
}
/**
 * A file rejection error.
 */
interface FileError {
  message: string;
  code: ErrorCode | string;
}
/**
 * What a custom `validator` returns: a single error, a list of errors, or `null` when the file
 * passes. A validator may return the result directly (synchronous) or wrapped in a `Promise`
 * (asynchronous, e.g. reading image dimensions or calling an external service).
 */
type ValidatorResult = FileError | readonly FileError[] | null;
declare enum ErrorCode {
  FileInvalidType = "file-invalid-type",
  FileTooLarge = "file-too-large",
  FileTooSmall = "file-too-small",
  TooManyFiles = "too-many-files"
}
//#endregion
//#region src/index.d.ts
interface DropzoneProps extends DropzoneOptions {
  children?: (state: DropzoneState) => React.ReactElement;
}
interface FileRejection {
  file: FileWithPath;
  errors: readonly FileError[];
}
type SharedProps = "multiple" | "onDragEnter" | "onDragOver" | "onDragLeave";
type DropzoneOptions = Pick<React.HTMLProps<HTMLElement>, SharedProps> & {
  accept?: Accept | AcceptGroup[];
  minSize?: number;
  maxSize?: number;
  maxFiles?: number;
  preventDropOnDocument?: boolean;
  noClick?: boolean;
  noKeyboard?: boolean;
  noDrag?: boolean;
  noDragEventsBubbling?: boolean;
  /**
   * If true, disables paste-to-upload. By default, when the dropzone (or a focused child) receives a
   * paste that carries files - e.g. a screenshot pasted with Ctrl/Cmd+V - those files go through the
   * same `accept`/size/`validator` checks and `onDrop` callbacks as a drop. Pastes with no files
   * (plain text, etc.) are ignored and left untouched. See
   * https://github.com/react-dropzone/react-dropzone/issues/1210
   */
  noPaste?: boolean;
  disabled?: boolean;
  onDrop?: <T extends File>(acceptedFiles: T[], fileRejections: FileRejection[], event: DropEvent) => void;
  onDropAccepted?: <T extends File>(files: T[], event: DropEvent) => void;
  onDropRejected?: (fileRejections: FileRejection[], event: DropEvent) => void;
  getFilesFromEvent?: (event: DropEvent | Array<FileSystemFileHandle>) => Promise<Array<File | DataTransferItem>>;
  onFileDialogCancel?: () => void;
  onFileDialogOpen?: () => void;
  onError?: (err: Error) => void;
  /**
   * Custom validation, run once per file on drop/selection. Return `null` to accept the file, or a
   * {@link FileError} (or array of them) to reject it. May be `async` (return a `Promise`) to support
   * checks that can't run synchronously - e.g. reading image dimensions, inspecting file contents,
   * or calling an external service. While an async validator is pending, {@link DropzoneState.isProcessing}
   * is `true`, and `onDrop`/`onDropAccepted`/`onDropRejected` fire only once it settles. If the
   * validator throws or rejects, `onError` is called and the drop is discarded.
   *
   * Note: the validator never runs during a drag (a `DataTransferItem` has no name/size), so a
   * validator-configured dropzone is `isDragUnknown` until drop.
   */
  validator?: <T extends File>(file: T) => ValidatorResult | Promise<ValidatorResult>;
  /**
   * Override the message of any rejection error (built-in or custom). Called once per error;
   * receives the error and the file it belongs to and returns the message to use. Return
   * `error.message` for codes you don't want to change. Useful for localizing error messages.
   */
  getErrorMessage?: (error: FileError, file: File) => string;
  useFsAccessApi?: boolean;
  autoFocus?: boolean;
};
type DropEvent = React.DragEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement> | React.ClipboardEvent<HTMLElement> | DragEvent | ClipboardEvent | Event;
interface DropzoneRef {
  open: () => void;
}
type DropzoneState = DropzoneRef & {
  isFocused: boolean;
  isDragActive: boolean;
  isDragAccept: boolean;
  isDragReject: boolean;
  isDragUnknown: boolean;
  isDragGlobal: boolean;
  isFileDialogActive: boolean;
  /**
   * `true` while a drop/selection is being processed asynchronously - i.e. while `getFilesFromEvent`
   * reads the files and/or an async {@link DropzoneOptions.validator} runs. Spans the whole pipeline,
   * from when files start being read until validation settles. When both are synchronous (the default
   * `getFilesFromEvent` with no/async-free validator) the work resolves within a microtask, so it's
   * only observable for genuinely async work. Use it to show a spinner or disable UI while processing.
   */
  isProcessing: boolean;
  acceptedFiles: readonly FileWithPath[];
  fileRejections: readonly FileRejection[];
  rootRef: React.RefObject<HTMLElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
};
interface DropzoneRootProps extends React.HTMLAttributes<HTMLElement> {
  refKey?: string;
  [key: string]: any;
}
interface DropzoneInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  refKey?: string;
}
/**
 * Convenience wrapper component for the `useDropzone` hook
 *
 * ```jsx
 * <Dropzone>
 *   {({getRootProps, getInputProps}) => (
 *     <div {...getRootProps()}>
 *       <input {...getInputProps()} />
 *       <p>Drag 'n' drop some files here, or click to select files</p>
 *     </div>
 *   )}
 * </Dropzone>
 * ```
 */
declare const Dropzone: React.ForwardRefExoticComponent<DropzoneProps & React.RefAttributes<DropzoneRef>>;
/**
 * A React hook that creates a drag 'n' drop area.
 *
 * ```jsx
 * function MyDropzone(props) {
 *   const {getRootProps, getInputProps} = useDropzone({
 *     onDrop: acceptedFiles => {
 *       // do something with the File objects, e.g. upload to some server
 *     }
 *   });
 *   return (
 *     <div {...getRootProps()}>
 *       <input {...getInputProps()} />
 *       <p>Drag and drop some files here, or click to select files</p>
 *     </div>
 *   )
 * }
 * ```
 */
declare function useDropzone(props?: DropzoneOptions): DropzoneState;
//#endregion
export { type Accept, type AcceptGroup, DropEvent, DropzoneInputProps, DropzoneOptions, DropzoneProps, DropzoneRef, DropzoneRootProps, DropzoneState, ErrorCode, type FileError, FileRejection, type FileWithPath, type ValidatorResult, Dropzone as default, useDropzone };
//# sourceMappingURL=index.d.ts.map