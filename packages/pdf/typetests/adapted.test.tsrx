// @parity-case types:pdf-adapted
import {
	Document,
	Outline,
	Page,
	PasswordResponses,
	Thumbnail,
	pdfjs,
	useDocumentContext,
	useOutlineContext,
	usePageContext,
} from '@octanejs/pdf';
import type {
	DocumentProps,
	LinkService,
	OutlineProps,
	PageProps,
	PasswordResponsesType,
	StructTreeNode,
	TextContent,
	TextItem,
	TextMarkedContent,
	ThumbnailProps,
} from '@octanejs/pdf';

const documentProps: DocumentProps = {
	file: { data: new Uint8Array() },
	className: ['document', null, { active: true }],
	onLoadSuccess(document) {
		document.numPages satisfies number;
	},
	onPassword(callback, reason) {
		reason satisfies number;
		callback('secret');
	},
	onMouseMove(event, document) {
		event.clientX satisfies number;
		if (document) document.numPages satisfies number;
	},
};

const pageProps: PageProps = {
	pageNumber: 1,
	renderAnnotationLayer: true,
	renderTextLayer: true,
	onLoadSuccess(page) {
		page.originalWidth satisfies number;
	},
	onMouseMove(_event, page) {
		if (page) page.originalWidth satisfies number;
	},
};
const outlineProps: OutlineProps = {
	onItemClick: ({ pageNumber }) => pageNumber,
	onMouseMove(_event, outline) {
		if (outline) outline.length satisfies number;
	},
};
const thumbnailProps: ThumbnailProps = { pageIndex: 0, onItemClick: ({ pageIndex }) => pageIndex };

const app = <Document {...documentProps}>
	<Page {...pageProps} />
	<Outline {...outlineProps} />
	<Thumbnail {...thumbnailProps} />
</Document>;

void [
	app,
	Document,
	Outline,
	Page,
	Thumbnail,
	PasswordResponses,
	pdfjs,
	useDocumentContext,
	useOutlineContext,
	usePageContext,
];

declare const linkService: LinkService;
declare const structTree: StructTreeNode;
declare const textContent: TextContent;
declare const textItem: TextItem;
declare const textMarkedContent: TextMarkedContent;
void [linkService, structTree, textContent, textItem, textMarkedContent];
