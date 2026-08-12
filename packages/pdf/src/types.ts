import type { PDFDataRangeTransport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { AnnotationLayerParameters } from 'pdfjs-dist/types/src/display/annotation_layer.js';
import type {
	DocumentInitParameters,
	RefProxy,
	StructTreeNode,
	TextContent,
	TextItem,
	TextMarkedContent,
	TypedArray,
} from 'pdfjs-dist/types/src/display/api.js';
import type { ClassValue, JSX } from 'octane/jsx-runtime';

import type LinkService from './LinkService.js';

export type { StructTreeNode, TextContent, TextItem, TextMarkedContent };
export type PasswordResponsesType = typeof import('pdfjs-dist').PasswordResponses;

export type OctaneNode = unknown;
export type OctaneRef<T> =
	{ current: T | null } | ((value: T | null) => void) | readonly OctaneRef<T>[] | null;
export type ClassName = ClassValue;
export type Annotations = NonNullable<AnnotationLayerParameters['annotations']>;
export type ResolvedDest = (RefProxy | number)[];
export type Dest = Promise<ResolvedDest> | ResolvedDest | string | null;
export type ExternalLinkRel = string;
export type ExternalLinkTarget = '_blank' | '_parent' | '_self' | '_top';
export type OnItemClickArgs = {
	dest?: Dest;
	pageIndex: number;
	pageNumber: number;
};
export type ScrollPageIntoViewArgs = {
	dest?: ResolvedDest;
	pageIndex?: number;
	pageNumber: number;
};
export type RenderMode = 'canvas' | 'custom' | 'none';
type BinaryData = TypedArray | ArrayBuffer | number[] | string;
export type Source =
	{ data: BinaryData | undefined } | { range: PDFDataRangeTransport } | { url: string };
export type File = string | ArrayBuffer | Blob | Source | null;
type SourceKey = keyof { data: unknown } | keyof { range: unknown } | keyof { url: unknown };
export type Options = {
	[K in keyof Omit<DocumentInitParameters, SourceKey>]: DocumentInitParameters[K] | null;
};
export type NodeOrRenderer = OctaneNode | (() => OctaneNode);
export type PageColors = { background: string; foreground: string };
export type PageCallback = PDFPageProxy & {
	height: number;
	originalHeight: number;
	originalWidth: number;
	width: number;
};
export type CustomRenderer = (props?: Record<string, never>) => OctaneNode;
export type CustomTextRenderer = (
	props: { itemIndex: number; pageIndex: number; pageNumber: number } & TextItem,
) => string;
export type FilterAnnotations = (args: { annotations: Annotations }) => Annotations;

export interface DocumentContextValue {
	imageResourcesPath?: string;
	linkService: LinkService;
	onItemClick?: (args: OnItemClickArgs) => void;
	pdf?: PDFDocumentProxy | false;
	registerPage: (pageIndex: number, ref: HTMLDivElement) => void;
	renderMode?: RenderMode;
	rotate?: number | null;
	scale?: number;
	unregisterPage: (pageIndex: number) => void;
}

export interface PageContextValue {
	page: PDFPageProxy | false | undefined;
	pageIndex: number;
	pageNumber: number;
	rotate: number;
	scale: number;
}

export interface OutlineContextValue {
	onItemClick?: (args: OnItemClickArgs) => void;
}

export type DocumentRenderProps = Omit<DocumentContextValue, 'pdf'> & { pdf: PDFDocumentProxy };
export type PageRenderProps = Omit<PageContextValue, 'page'> & { page: PDFPageProxy };

type DivProps = JSX.IntrinsicElements['div'];
type EventKey = NonNullable<
	{
		[Key in keyof DivProps]: Key extends `on${string}` ? Key : never;
	}[keyof DivProps]
>;
type EventProps<Value> = {
	[Key in EventKey]?: NonNullable<DivProps[Key]> extends (
		event: infer Event,
		...args: never[]
	) => unknown
		? (event: Event, value: Value) => void
		: never;
};
export type HostProps<Value> = EventProps<Value> & {
	children?: OctaneNode;
	class?: ClassName;
	className?: ClassName;
	ref?: OctaneRef<unknown>;
};

export type DocumentProps = HostProps<PDFDocumentProxy | false | undefined> & {
	children?: OctaneNode | ((props: DocumentRenderProps) => OctaneNode);
	error?: NodeOrRenderer;
	externalLinkRel?: ExternalLinkRel;
	externalLinkTarget?: ExternalLinkTarget;
	file?: File;
	imageResourcesPath?: string;
	inputRef?: OctaneRef<HTMLDivElement>;
	loading?: NodeOrRenderer;
	noData?: NodeOrRenderer;
	onItemClick?: (args: OnItemClickArgs) => void;
	onLoadError?: (error: Error) => void;
	onLoadProgress?: (args: { loaded: number; total: number }) => void;
	onLoadSuccess?: (document: PDFDocumentProxy) => void;
	onPassword?: (callback: (password: string | null) => void, reason: number) => void;
	onSourceError?: (error: Error) => void;
	onSourceSuccess?: () => void;
	options?: Options;
	renderMode?: RenderMode;
	rotate?: number | null;
	scale?: number;
};

export type PageProps = HostProps<PageCallback | false | undefined> & {
	_className?: string;
	_enableRegisterUnregisterPage?: boolean;
	canvasBackground?: string;
	canvasRef?: OctaneRef<HTMLCanvasElement>;
	children?: OctaneNode | ((props: PageRenderProps) => OctaneNode);
	customRenderer?: CustomRenderer;
	customTextRenderer?: CustomTextRenderer;
	devicePixelRatio?: number;
	error?: NodeOrRenderer;
	filterAnnotations?: FilterAnnotations;
	height?: number;
	imageResourcesPath?: string;
	inputRef?: OctaneRef<HTMLDivElement>;
	loading?: NodeOrRenderer;
	noData?: NodeOrRenderer;
	onGetAnnotationsError?: (error: Error) => void;
	onGetAnnotationsSuccess?: (annotations: Annotations) => void;
	onGetStructTreeError?: (error: Error) => void;
	onGetStructTreeSuccess?: (tree: StructTreeNode) => void;
	onGetTextError?: (error: Error) => void;
	onGetTextSuccess?: (content: TextContent) => void;
	onLoadError?: (error: Error) => void;
	onLoadSuccess?: (page: PageCallback) => void;
	onRenderAnnotationLayerError?: (error: unknown) => void;
	onRenderAnnotationLayerSuccess?: () => void;
	onRenderError?: (error: Error) => void;
	onRenderSuccess?: (page: PageCallback) => void;
	onRenderTextLayerError?: (error: Error) => void;
	onRenderTextLayerSuccess?: () => void;
	pageColors?: PageColors;
	pageIndex?: number;
	pageNumber?: number;
	pdf?: PDFDocumentProxy | false;
	registerPage?: (pageIndex: number, ref: HTMLDivElement) => void;
	renderAnnotationLayer?: boolean;
	renderForms?: boolean;
	renderMode?: RenderMode;
	renderTextLayer?: boolean;
	rotate?: number | null;
	scale?: number;
	unregisterPage?: (pageIndex: number) => void;
	width?: number;
};

export type ThumbnailProps = Omit<
	PageProps,
	| 'className'
	| 'customTextRenderer'
	| 'onGetAnnotationsError'
	| 'onGetAnnotationsSuccess'
	| 'onGetTextError'
	| 'onGetTextSuccess'
	| 'onRenderAnnotationLayerError'
	| 'onRenderAnnotationLayerSuccess'
	| 'onRenderTextLayerError'
	| 'onRenderTextLayerSuccess'
	| 'renderAnnotationLayer'
	| 'renderForms'
	| 'renderTextLayer'
> & {
	className?: ClassName;
	onItemClick?: (args: OnItemClickArgs) => void;
};

export type OutlineProps = HostProps<
	Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | false | undefined
> & {
	inputRef?: OctaneRef<HTMLDivElement>;
	onItemClick?: (args: OnItemClickArgs) => void;
	onLoadError?: (error: Error) => void;
	onLoadSuccess?: (outline: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>) => void;
	pdf?: PDFDocumentProxy | false;
};
