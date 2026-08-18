// @parity-case types:pdf-pristine
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
} from 'react-pdf';
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
} from 'react-pdf';

const documentProps: DocumentProps = {
	file: { data: new Uint8Array() },
	className: ['document', null],
	onLoadSuccess(document) {
		document.numPages satisfies number;
	},
	onPassword(callback, reason) {
		reason satisfies number;
		callback('secret');
	},
};

const pageProps: PageProps = {
	pageNumber: 1,
	renderAnnotationLayer: true,
	renderTextLayer: true,
	onLoadSuccess(page) {
		page.originalWidth satisfies number;
	},
};
const outlineProps: OutlineProps = { onItemClick: ({ pageNumber }) => pageNumber };
const thumbnailProps: ThumbnailProps = { pageIndex: 0, onItemClick: ({ pageIndex }) => pageIndex };

const app = (
	<Document {...documentProps}>
		<Page {...pageProps} />
		<Outline {...outlineProps} />
		<Thumbnail {...thumbnailProps} />
	</Document>
);

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

// @ts-expect-error pageNumber is numeric
const invalidPage: PageProps = { pageNumber: '1' };
// @ts-expect-error unsupported rendering mode
const invalidMode: PageProps = { renderMode: 'svg' };
void [invalidPage, invalidMode];
