import type { PDFDocumentProxy } from 'pdfjs-dist';

import type {
	Dest,
	ExternalLinkRel,
	ExternalLinkTarget,
	ResolvedDest,
	ScrollPageIntoViewArgs,
} from './types.js';

type PDFViewer = {
	currentPageNumber?: number;
	scrollPageIntoView: (args: ScrollPageIntoViewArgs) => void;
};

const DEFAULT_LINK_REL = 'noopener noreferrer nofollow';

export default class LinkService {
	externalLinkEnabled = true;
	externalLinkRel?: ExternalLinkRel;
	externalLinkTarget?: ExternalLinkTarget;
	isInPresentationMode = false;
	pdfDocument?: PDFDocumentProxy | null;
	pdfViewer?: PDFViewer | null;

	setDocument(pdfDocument: PDFDocumentProxy): void {
		this.pdfDocument = pdfDocument;
	}

	setViewer(pdfViewer: PDFViewer): void {
		this.pdfViewer = pdfViewer;
	}

	setExternalLinkRel(value?: ExternalLinkRel): void {
		this.externalLinkRel = value;
	}

	setExternalLinkTarget(value?: ExternalLinkTarget): void {
		this.externalLinkTarget = value;
	}

	setHash(): void {}
	setHistory(): void {}
	goToXY(): void {}
	cachePageRef(): void {}
	executeNamedAction(): void {}
	executeSetOCGState(): void {}

	get pagesCount(): number {
		return this.pdfDocument?.numPages ?? 0;
	}

	get page(): number {
		return this.pdfViewer?.currentPageNumber ?? 0;
	}

	set page(value: number) {
		if (!this.pdfViewer) throw new Error('PDF viewer is not initialized.');
		this.pdfViewer.currentPageNumber = value;
	}

	get rotation(): number {
		return 0;
	}

	set rotation(_value: number) {}

	addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow = false): void {
		link.href = url;
		link.rel = this.externalLinkRel || DEFAULT_LINK_REL;
		link.target = newWindow ? '_blank' : this.externalLinkTarget || '';
	}

	async goToDestination(dest: Dest): Promise<void> {
		if (!this.pdfDocument) throw new Error('PDF document not loaded.');
		if (!dest) throw new Error('Destination is not specified.');
		const explicitDest =
			typeof dest === 'string' ? await this.pdfDocument.getDestination(dest) : await dest;
		if (!Array.isArray(explicitDest))
			throw new Error(`"${explicitDest}" is not a valid destination array.`);
		const destRef = explicitDest[0];
		let pageIndex: number;
		if (typeof destRef === 'number') {
			pageIndex = destRef;
		} else if (destRef && typeof destRef === 'object') {
			try {
				pageIndex = await this.pdfDocument.getPageIndex(destRef);
			} catch {
				throw new Error(`"${destRef}" is not a valid page reference.`);
			}
		} else {
			throw new Error(`"${destRef}" is not a valid destination reference.`);
		}
		this.scrollTo(pageIndex + 1, explicitDest as ResolvedDest);
	}

	goToPage(pageNumber: number): void {
		this.scrollTo(pageNumber);
	}

	private scrollTo(pageNumber: number, dest?: ResolvedDest): void {
		if (!this.pdfViewer) throw new Error('PDF viewer is not initialized.');
		if (pageNumber < 1 || pageNumber > this.pagesCount) {
			throw new Error(`"${pageNumber}" is not a valid page number.`);
		}
		this.pdfViewer.scrollPageIntoView({ dest, pageIndex: pageNumber - 1, pageNumber });
	}

	getDestinationHash(): string {
		return '#';
	}

	getAnchorUrl(): string {
		return '#';
	}

	isPageVisible(): boolean {
		return true;
	}

	isPageCached(): boolean {
		return true;
	}

	navigateTo(dest: Dest): void {
		void this.goToDestination(dest);
	}
}
