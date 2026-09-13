/**
 * Evidence-only public barrel for `react-grab/primitives`.
 * Direct declarations (no type-only re-export aliases); nested owner handles
 * stay opaque without embedding `any`/`unknown`.
 */

export interface ElementAtPointOptions {
	container?: Element;
	filter?: (element: Element) => boolean;
}

export interface ElementBounds {
	x: number;
	y: number;
	width: number;
	height: number;
	borderRadius: string;
}

/** Opaque stack frame shape for clipboard / context probes. */
export interface StackFrame {
	columnNumber?: number;
	lineNumber?: number;
	enclosingLineNumber?: number;
	enclosingColumnNumber?: number;
	fileName?: string;
	functionName?: string;
	source?: string;
	isServer?: boolean;
	isSymbolicated?: boolean;
	isIgnoreListed?: boolean;
}

/** Opaque owner handle exposed on element context (not a React Fiber). */
export interface GrabOwnerHandle {
	readonly handle: object;
}

export interface ReactGrabElementContext {
	element: Element;
	snippet: string;
	htmlPreview: string;
	stackString: string;
	stack: StackFrame[];
	componentName: string | null;
	filePath: string | null;
	lineNumber: number | null;
	columnNumber: number | null;
	fiber: GrabOwnerHandle | null;
	selector: string | null;
	styles: string;
}

export interface CopyContentOptions {
	componentName?: string;
	tagName?: string;
	commentText?: string;
}

export declare const disposeBaselineStyles: () => void;
export declare const isElementGrabbable: (element: Element) => boolean;
export declare const getElementBounds: (element: Element) => ElementBounds;
export declare const getElementSelector: (element: Element) => string;
export declare const getElementContext: (element: Element) => Promise<ReactGrabElementContext>;
export declare const getElementAtPoint: (
	clientX: number,
	clientY: number,
	options?: ElementAtPointOptions,
) => Element | null;
export declare const getElementsAtPoint: (
	clientX: number,
	clientY: number,
	options?: ElementAtPointOptions,
) => Element[];
/** @deprecated Prefer getElementsAtPoint. */
export declare const getElementsAtPosition: (clientX: number, clientY: number) => Element[];
export declare const freeze: (elements?: Element[]) => void;
export declare const unfreeze: () => void;
export declare const isFreezeActive: () => boolean;
export declare const openFile: (filePath: string, lineNumber?: number) => Promise<void>;
export declare const copyContent: (content: string, options?: CopyContentOptions) => boolean;

export declare class FreezeError extends Error {
	static prepareStackTrace(
		error: Error,
		_structuredStackTrace: ReadonlyArray<{
			getFileName(): string | null;
			getFunctionName(): string | null;
			getLineNumber(): number | null;
			getColumnNumber(): number | null;
		}>,
	): string;
	constructor(cause?: object | string | number | boolean | null);
}
export declare class OpenFileError extends Error {
	static prepareStackTrace(
		error: Error,
		_structuredStackTrace: ReadonlyArray<{
			getFileName(): string | null;
			getFunctionName(): string | null;
			getLineNumber(): number | null;
			getColumnNumber(): number | null;
		}>,
	): string;
	readonly filePath: string;
	readonly lineNumber: number | undefined;
	constructor(filePath: string, lineNumber: number | undefined, cause?: object | string | null);
}
