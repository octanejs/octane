import type { FileWithPath } from 'file-selector';
import type { Accept, AcceptGroup, FileError, ValidatorResult } from './utils/index.ts';

export type { FileWithPath };
export type { Accept, AcceptGroup, FileError, ValidatorResult } from './utils/index.ts';

export type DropEvent = DragEvent | ClipboardEvent | Event;
export interface FileRejection {
	file: FileWithPath;
	errors: readonly FileError[];
}
export interface DropzoneRef {
	open: () => void;
}
export interface DropzoneRootProps extends Record<string, any> {
	refKey?: string;
	[key: string]: any;
}
export interface DropzoneInputProps extends Record<string, any> {
	refKey?: string;
}

interface SharedProps {
	multiple?: boolean;
	onDragEnter?: (event: DragEvent) => void;
	onDragOver?: (event: DragEvent) => void;
	onDragLeave?: (event: DragEvent) => void;
}

export type DropzoneOptions = SharedProps & {
	accept?: Accept | AcceptGroup[];
	minSize?: number;
	maxSize?: number;
	maxFiles?: number;
	preventDropOnDocument?: boolean;
	noClick?: boolean;
	noKeyboard?: boolean;
	noDrag?: boolean;
	noDragEventsBubbling?: boolean;
	noPaste?: boolean;
	disabled?: boolean;
	onDrop?: <T extends File>(
		acceptedFiles: T[],
		fileRejections: FileRejection[],
		event: DropEvent,
	) => void;
	onDropAccepted?: <T extends File>(files: T[], event: DropEvent) => void;
	onDropRejected?: (fileRejections: FileRejection[], event: DropEvent) => void;
	getFilesFromEvent?: (
		event: DropEvent | FileSystemFileHandle[],
	) => Promise<Array<File | DataTransferItem>>;
	onFileDialogCancel?: () => void;
	onFileDialogOpen?: () => void;
	onError?: (error: Error) => void;
	validator?: <T extends File>(file: T) => ValidatorResult | Promise<ValidatorResult>;
	getErrorMessage?: (error: FileError, file: File) => string;
	useFsAccessApi?: boolean;
	autoFocus?: boolean;
};

export interface DropzoneProps extends DropzoneOptions {
	children?: ((state: DropzoneState) => any) | object | string | number | bigint | boolean | null;
	ref?: ((instance: DropzoneRef | null) => void) | { current: DropzoneRef | null } | null;
}

export type DropzoneState = DropzoneRef & {
	isFocused: boolean;
	isDragActive: boolean;
	isDragAccept: boolean;
	isDragReject: boolean;
	isDragUnknown: boolean;
	isDragGlobal: boolean;
	isFileDialogActive: boolean;
	isProcessing: boolean;
	acceptedFiles: readonly FileWithPath[];
	fileRejections: readonly FileRejection[];
	rootRef: { current: HTMLElement | null };
	inputRef: { current: HTMLInputElement | null };
	getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
	getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
};
