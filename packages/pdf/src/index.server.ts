import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export { Document, Outline, Page, Thumbnail } from './components.tsrx';
export { useDocumentContext, useOutlineContext, usePageContext } from './contexts.js';
export { default as PasswordResponses } from './PasswordResponses.js';
export { pdfjs };
export type { default as LinkService } from './LinkService.js';
export type {
	DocumentProps,
	OutlineProps,
	PageProps,
	PasswordResponsesType,
	StructTreeNode,
	TextContent,
	TextItem,
	TextMarkedContent,
	ThumbnailProps,
} from './types.js';
