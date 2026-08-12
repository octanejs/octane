import { createElement, isChildrenBlock, useEffect, useMemo, useRef, useState } from 'octane';
import makeEventProps from 'make-event-props';
import type {
	PDFDocumentLoadingTask,
	PDFDocumentProxy,
	PDFPageProxy,
	PageViewport,
} from 'pdfjs-dist';

import { DocumentContext, OutlineContext, PageContext, useDocumentContext } from './contexts.js';
import LinkService from './LinkService.js';
import PasswordResponses from './PasswordResponses.js';
import Ref from './Ref.js';
import { setRef } from './refs.js';
import { convertDataUriParameterObject, dataURItoBytes, isDataURI } from './utils.js';
import type {
	Annotations,
	DocumentContextValue,
	DocumentProps,
	DocumentRenderProps,
	NodeOrRenderer,
	OutlineProps,
	PageCallback,
	PageProps,
	PageRenderProps,
	Source,
	StructTreeNode,
	TextItem,
	ThumbnailProps,
} from './types.js';

const BLOCKED_CUSTOM_TEXT_TAGS = new Set([
	'base',
	'embed',
	'iframe',
	'link',
	'meta',
	'object',
	'script',
	'style',
	'template',
]);
const URL_ATTRIBUTES = new Set(['action', 'formaction', 'href', 'poster', 'src', 'xlink:href']);

function isDangerousUrl(value: string): boolean {
	return value.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase().match(
		/^(?:javascript|vbscript):/,
	) !==
		null;
}

function sanitizeCustomTextNode(node: ChildNode): Node {
	if (!(node instanceof HTMLElement)) return document.createTextNode(node.textContent ?? '');
	if (BLOCKED_CUSTOM_TEXT_TAGS.has(node.tagName.toLowerCase())) {
		return document.createTextNode(node.textContent ?? '');
	}
	const sanitized = document.createElement(node.tagName.toLowerCase());
	for (const attribute of node.attributes) {
		const name = attribute.name.toLowerCase();
		if (name.startsWith('on') || name === 'srcdoc') continue;
		if (URL_ATTRIBUTES.has(name) && isDangerousUrl(attribute.value)) continue;
		sanitized.setAttribute(attribute.name, attribute.value);
	}
	for (const child of node.childNodes) sanitized.append(sanitizeCustomTextNode(child));
	return sanitized;
}

function renderSafeCustomText(target: Element, content: string): void {
	const template = document.createElement('template');
	template.innerHTML = content;
	const fragment = document.createDocumentFragment();
	for (const child of template.content.childNodes) fragment.append(sanitizeCustomTextNode(child));
	target.replaceChildren(fragment);
}

function renderMessage(value: NodeOrRenderer): unknown {
	return typeof value === 'function' ? value() : value;
}

function withEventData(props: Record<string, unknown>, value: unknown): Record<string, unknown> {
	return makeEventProps(props as never, () => value) as Record<string, unknown>;
}

async function resolveSource(file: DocumentProps['file']): Promise<Source | null> {
	if (!file) return null;
	if (typeof file === 'string') {
		return isDataURI(file) ? { data: dataURItoBytes(file) } : { url: file };
	}
	if (file instanceof ArrayBuffer) return { data: file };
	if (typeof Blob !== 'undefined' && file instanceof Blob) {
		return { data: await file.arrayBuffer() };
	}
	if (typeof file === 'object' && ('data' in file || 'range' in file || 'url' in file)) {
		if ('url' in file && typeof file.url === 'string' && isDataURI(file.url)) {
			return convertDataUriParameterObject(file);
		}
		return file;
	}
	throw new Error('Invalid PDF source.');
}

function defaultOnPassword(callback: (password: string | null) => void, reason: number): void {
	if (typeof prompt !== 'function') return callback(null);
	callback(
		prompt(
			reason === PasswordResponses.INCORRECT_PASSWORD
				? 'Invalid password. Please try again.'
				: 'Enter the password to open this PDF file.',
		),
	);
}

export function Document(props: DocumentProps = {}) {
	const {
		children,
		class: classProp,
		className,
		error = 'Failed to load PDF file.',
		externalLinkRel,
		externalLinkTarget,
		file,
		imageResourcesPath,
		inputRef,
		loading = 'Loading PDF…',
		noData = 'No PDF file specified.',
		onItemClick,
		onLoadError,
		onLoadProgress,
		onLoadSuccess,
		onPassword = defaultOnPassword,
		onSourceError,
		onSourceSuccess,
		options,
		ref,
		renderMode,
		rotate,
		scale,
		...hostProps
	} = props;
	const documentElement = useRef<HTMLDivElement | null>(null);
	const linkServiceRef = useRef<LinkService | null>(null);
	const pagesRef = useRef<HTMLDivElement[]>([]);
	const [source, setSource] = useState<Source | false | null | undefined>(undefined);
	const [sourceError, setSourceError] = useState<Error | null>(null);
	const [pdf, setPdf] = useState<PDFDocumentProxy | false | undefined>(undefined);
	const [pdfError, setPdfError] = useState<Error | null>(null);

	if (!linkServiceRef.current) linkServiceRef.current = new LinkService();
	const linkService = linkServiceRef.current;

	useEffect(() => {
		setRef(inputRef, documentElement.current);
		return () => setRef(inputRef, null);
	}, [inputRef]);

	useEffect(() => {
		const imperative = {
			linkService: linkServiceRef,
			pages: pagesRef,
			viewer: {
				current: {
					scrollPageIntoView({ pageIndex = 0 }: { pageIndex?: number }) {
						pagesRef.current[pageIndex]?.scrollIntoView();
					},
				},
			},
		};
		setRef(ref as never, imperative);
		return () => setRef(ref as never, null);
	}, [ref]);

	useEffect(() => {
		let active = true;
		setSource(undefined);
		setSourceError(null);
		void resolveSource(file).then((nextSource) => {
			if (!active) return;
			setSource(nextSource);
			onSourceSuccess?.();
		}).catch((caught: unknown) => {
			if (!active) return;
			const nextError =
				caught instanceof Error ? caught : new Error(String(caught));
			setSource(false);
			setSourceError(nextError);
			onSourceError?.(nextError);
		});
		return () => {
			active = false;
		};
	}, [file]);

	useEffect(() => {
		let loadingTask: PDFDocumentLoadingTask | undefined;
		let active = true;
		setPdf(undefined);
		setPdfError(null);
		if (!source) return;

		void import('pdfjs-dist').then((pdfjs) => {
			if (!active) return;
			loadingTask = pdfjs.getDocument({ ...source, ...options } as never);
			if (onLoadProgress) loadingTask.onProgress = onLoadProgress;
			loadingTask.onPassword = onPassword;
			return loadingTask.promise;
		}).then((nextPdf) => {
			if (!active || !nextPdf) return;
			setPdf(nextPdf);
			pagesRef.current = new Array(nextPdf.numPages);
			linkService.setDocument(nextPdf);
			onLoadSuccess?.(nextPdf);
		}).catch((caught: unknown) => {
			if (!active) return;
			const nextError =
				caught instanceof Error ? caught : new Error(String(caught));
			setPdf(false);
			setPdfError(nextError);
			onLoadError?.(nextError);
		});

		return () => {
			active = false;
			void loadingTask?.destroy();
		};
	}, [source, options]);

	useEffect(() => {
		linkService.setExternalLinkRel(externalLinkRel);
		linkService.setExternalLinkTarget(externalLinkTarget);
		linkService.setViewer({
			scrollPageIntoView({ pageIndex = 0 }) {
				if (onItemClick) {
					onItemClick({ pageIndex, pageNumber: pageIndex + 1 });
					return;
				}
				pagesRef.current[pageIndex]?.scrollIntoView();
			},
		});
	}, [externalLinkRel, externalLinkTarget, onItemClick]);

	const contextValue = useMemo<DocumentContextValue>(
		() => ({
			imageResourcesPath,
			linkService,
			onItemClick,
			pdf,
			registerPage(index, element) {
				pagesRef.current[index] = element;
			},
			renderMode,
			rotate,
			scale,
			unregisterPage(index) {
				delete pagesRef.current[index];
			},
		}),
		[imageResourcesPath, linkService, onItemClick, pdf, renderMode, rotate, scale],
	);

	let content: unknown;
	if (!file) {
		content = <div class="react-pdf__message react-pdf__message--no-data">{renderMessage(
			noData,
		)}</div>;
	} else if (sourceError || pdfError || source === false || pdf === false) {
		content = <div class="react-pdf__message react-pdf__message--error">{renderMessage(
			error,
		)}</div>;
	} else if (!pdf) {
		content = <div class="react-pdf__message react-pdf__message--loading">{renderMessage(
			loading,
		)}</div>;
	} else {
		content = typeof children === 'function' && !isChildrenBlock(children)
			? children(contextValue as DocumentRenderProps)
			: children;
	}

	return <div
		{...withEventData(hostProps, pdf)}
		ref={documentElement}
		class={['react-pdf__Document', classProp, className]}
	>
		<DocumentContext.Provider value={contextValue}>{content}</DocumentContext.Provider>
	</div>;
}

function makePageCallback(page: PDFPageProxy, viewport: PageViewport): PageCallback {
	const original = page.getViewport({ scale: 1, rotation: viewport.rotation });
	return Object.assign(page, {
		width: viewport.width,
		height: viewport.height,
		originalWidth: original.width,
		originalHeight: original.height,
	});
}

const PDF_ROLE_TO_HTML_ROLE: Record<string, string | undefined> = {
	Part: 'group',
	Sect: 'group',
	Div: 'group',
	Aside: 'note',
	NonStruct: 'none',
	H: 'heading',
	FENote: 'note',
	Sub: 'group',
	Link: 'link',
	Annot: 'note',
	Form: 'form',
	L: 'list',
	LI: 'listitem',
	Table: 'table',
	TR: 'row',
	TH: 'columnheader',
	TD: 'cell',
	THead: 'columnheader',
	Figure: 'figure',
};

function StructTreeItem({ node, className }: { node: unknown; className?: string }) {
	if (!node || typeof node !== 'object') return null;
	const value = node as {
		alt?: string;
		children?: unknown[];
		id?: string;
		lang?: string;
		role?: string;
	};
	const attributes: Record<string, unknown> = {};
	if (value.alt !== undefined) attributes['aria-label'] = value.alt;
	if (value.lang !== undefined) attributes.lang = value.lang;
	if (value.id !== undefined) attributes['aria-owns'] = value.id;
	if (value.role) {
		const heading = /^H(\d+)$/.exec(value.role);
		if (heading) {
			attributes.role = 'heading';
			attributes['aria-level'] = Number(heading[1]);
		} else if (PDF_ROLE_TO_HTML_ROLE[value.role]) {
			attributes.role = PDF_ROLE_TO_HTML_ROLE[value.role];
		}
	}
	const onlyContentChild =
		value.children?.length === 1 && value.children[0] != null &&
			typeof value.children[0] === 'object' &&
			'id' in value.children[0];
	if (onlyContentChild) {
		const child = value.children?.[0] as { id?: string };
		if (child.id !== undefined) attributes['aria-owns'] = child.id;
	}
	return <span class={className} {...attributes}>
		{onlyContentChild ? null : value.children?.map((child) => <StructTreeItem node={child} />)}
	</span>;
}

export function Page(props: PageProps = {}) {
	const documentContext = useDocumentContext();
	const merged = { ...documentContext, ...props } as PageProps & Partial<DocumentContextValue>;
	const {
		_className = 'react-pdf__Page',
		_enableRegisterUnregisterPage = true,
		canvasBackground,
		canvasRef,
		children,
		class: classProp,
		className,
		customRenderer,
		customTextRenderer,
		devicePixelRatio,
		error = 'Failed to load the page.',
		filterAnnotations,
		height,
		imageResourcesPath,
		inputRef,
		loading = 'Loading page…',
		linkService: _linkService,
		noData = 'No page specified.',
		onGetAnnotationsError,
		onGetAnnotationsSuccess,
		onGetStructTreeError,
		onGetStructTreeSuccess,
		onGetTextError,
		onGetTextSuccess,
		onLoadError,
		onLoadSuccess,
		onItemClick: _onItemClick,
		onRenderAnnotationLayerError,
		onRenderAnnotationLayerSuccess,
		onRenderError,
		onRenderSuccess,
		onRenderTextLayerError,
		onRenderTextLayerSuccess,
		pageColors,
		pageIndex: pageIndexProp,
		pageNumber: pageNumberProp,
		pdf,
		registerPage,
		renderAnnotationLayer = true,
		renderForms = false,
		renderMode = 'canvas',
		renderTextLayer = true,
		rotate: rotateProp,
		scale: scaleProp = 1,
		unregisterPage,
		width,
		...hostProps
	} = merged;
	const pageElement = useRef<HTMLDivElement | null>(null);
	const canvasElement = useRef<HTMLCanvasElement | null>(null);
	const textElement = useRef<HTMLDivElement | null>(null);
	const annotationElement = useRef<HTMLDivElement | null>(null);
	const [page, setPage] = useState<PDFPageProxy | false | undefined>(undefined);
	const [pageError, setPageError] = useState<Error | null>(null);
	const [structTree, setStructTree] = useState<StructTreeNode | null | undefined>(undefined);
	const pageIndex =
		pageNumberProp != null ? pageNumberProp - 1 : pageIndexProp;
	const pageNumber = pageNumberProp ?? (pageIndexProp != null ? pageIndexProp + 1 : undefined);

	if (pdf === undefined && documentContext === null) {
		throw new Error('Attempted to load a page, but no document was specified.');
	}

	const viewport = useMemo(() => {
		if (!page || !pageNumber) return null;
		const rotation = rotateProp ?? page.rotate;
		const base = page.getViewport({ scale: 1, rotation });
		const sizeScale =
			width
				? width / base.width
				: height
					? height / base.height
					: 1;
		return page.getViewport({ scale: scaleProp * sizeScale, rotation });
	}, [height, page, pageNumber, rotateProp, scaleProp, width]);

	useEffect(() => {
		let active = true;
		setPage(undefined);
		setPageError(null);
		if (!pdf || !pageNumber) return;
		void pdf.getPage(pageNumber).then((nextPage) => {
			if (!active) return;
			setPage(nextPage);
		}).catch((caught: unknown) => {
			if (!active) return;
			const nextError =
				caught instanceof Error ? caught : new Error(String(caught));
			setPage(false);
			setPageError(nextError);
			onLoadError?.(nextError);
		});
		return () => {
			active = false;
		};
	}, [pdf, pageNumber]);

	useEffect(() => {
		if (!page || !viewport || pageIndex == null) return;
		const callback = makePageCallback(page, viewport);
		onLoadSuccess?.(callback);
		if (_enableRegisterUnregisterPage && pageElement.current) {
			registerPage?.(pageIndex, pageElement.current);
		}
		return () => {
			if (_enableRegisterUnregisterPage) unregisterPage?.(pageIndex);
		};
	}, [page, viewport, pageIndex]);

	useEffect(() => {
		setRef(inputRef, pageElement.current);
		return () => setRef(inputRef, null);
	}, [inputRef]);

	useEffect(() => {
		setRef(canvasRef, canvasElement.current);
		return () => setRef(canvasRef, null);
	}, [canvasRef, page, renderMode]);

	useEffect(() => {
		if (!page || !viewport || renderMode !== 'canvas' || !canvasElement.current) return;
		let active = true;
		let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined;
		const canvas = canvasElement.current;
		const ratio = devicePixelRatio ?? window.devicePixelRatio ?? 1;
		const renderViewport = page.getViewport({
			rotation: viewport.rotation,
			scale: viewport.scale * ratio,
		});
		page.cleanup();
		canvas.width = Math.floor(renderViewport.width);
		canvas.height = Math.floor(renderViewport.height);
		canvas.style.width = `${Math.floor(viewport.width)}px`;
		canvas.style.height = `${Math.floor(viewport.height)}px`;
		canvas.style.visibility = 'hidden';
		void import('pdfjs-dist').then((pdfjs) => {
			if (!active) return;
			renderTask = page.render({
				annotationMode: renderForms
					? pdfjs.AnnotationMode.ENABLE_FORMS
					: pdfjs.AnnotationMode.ENABLE,
				canvas,
				canvasContext: canvas.getContext('2d', { alpha: false })!,
				background: canvasBackground,
				pageColors,
				viewport: renderViewport,
			});
			return renderTask.promise;
		}).then(() => {
			if (!active || !renderTask) return;
			canvas.style.visibility = '';
			onRenderSuccess?.(makePageCallback(page, viewport));
		}).catch((caught: unknown) => {
			if (!active || caught instanceof Error && caught.name === 'AbortException') return;
			onRenderError?.(caught instanceof Error ? caught : new Error(String(caught)));
		});
		return () => {
			active = false;
			renderTask?.cancel();
			canvas.width = 0;
			canvas.height = 0;
		};
	}, [canvasBackground, devicePixelRatio, page, pageColors, renderForms, renderMode, viewport]);

	useEffect(() => {
		if (!page || !viewport || pageIndex == null || pageNumber == null || !renderTextLayer) return;
		let active = true;
		let textLayer: { cancel: () => void; render: () => Promise<void> } | undefined;
		let contentLoaded = false;
		const element = textElement.current;
		if (!element) return;
		element.replaceChildren();
		void page.getTextContent().then(async (content) => {
			if (!active) return;
			contentLoaded = true;
			onGetTextSuccess?.(content);
			const pdfjs = await import('pdfjs-dist');
			if (!active) return;
			textLayer = new pdfjs.TextLayer({
				container: element,
				textContentSource: page.streamTextContent({ includeMarkedContent: true }),
				viewport,
			}) as { cancel: () => void; render: () => Promise<void> };
			await textLayer.render();
			if (!active) return;
			const end = document.createElement('div');
			end.className = 'endOfContent';
			element.append(end);
			if (customTextRenderer) {
				const children = element.querySelectorAll('[role="presentation"]');
				let childIndex = 0;
				content.items.forEach((item, itemIndex) => {
					if (!('str' in item)) return;
					const child = children[childIndex];
					if (child) {
						renderSafeCustomText(
							child,
							customTextRenderer({
								...item,
								itemIndex,
								pageIndex,
								pageNumber,
							}),
						);
					}
					childIndex += item.str && item.hasEOL ? 2 : 1;
				});
			}
			onRenderTextLayerSuccess?.();
		}).catch((caught: unknown) => {
			if (!active || caught instanceof Error && caught.name === 'AbortException') return;
			const error =
				caught instanceof Error ? caught : new Error(String(caught));
			if (contentLoaded) onRenderTextLayerError?.(error);
			else onGetTextError?.(error);
		});
		return () => {
			active = false;
			textLayer?.cancel();
			element.replaceChildren();
		};
	}, [customTextRenderer, page, pageIndex, pageNumber, renderTextLayer, viewport]);

	useEffect(() => {
		if (!page || !viewport || !pdf || !renderAnnotationLayer) return;
		let active = true;
		let annotationsLoaded = false;
		const element = annotationElement.current;
		if (!element) return;
		element.replaceChildren();
		void page.getAnnotations().then(async (loadedAnnotations) => {
			if (!active) return;
			annotationsLoaded = true;
			onGetAnnotationsSuccess?.(loadedAnnotations);
			const annotations =
				filterAnnotations
					? filterAnnotations({ annotations: loadedAnnotations })
					: loadedAnnotations;
			const pdfjs = await import('pdfjs-dist');
			if (!active) return;
			const annotationViewport = viewport.clone({ dontFlip: true });
			const parameters = {
				accessibilityManager: null,
				annotationCanvasMap: null,
				annotationEditorUIManager: null,
				annotationStorage: pdf.annotationStorage,
				commentManager: null,
				div: element,
				l10n: null,
				linkService: documentContext?.linkService,
				page,
				structTreeLayer: null,
				viewport: annotationViewport,
			};
			new pdfjs.AnnotationLayer(parameters as never).render(
				{
					annotations,
					annotationStorage: pdf.annotationStorage,
					div: element,
					imageResourcesPath,
					linkService: documentContext?.linkService,
					page,
					renderForms,
					viewport: annotationViewport,
				} as never,
			);
			onRenderAnnotationLayerSuccess?.();
		}).catch((caught: unknown) => {
			if (!active) return;
			const error =
				caught instanceof Error ? caught : new Error(String(caught));
			if (annotationsLoaded) onRenderAnnotationLayerError?.(error);
			else onGetAnnotationsError?.(error);
		});
		return () => {
			active = false;
			element.replaceChildren();
		};
	}, [filterAnnotations, imageResourcesPath, page, pdf, renderAnnotationLayer, renderForms, viewport]);

	useEffect(() => {
		let active = true;
		setStructTree(undefined);
		if (!page || customTextRenderer || !renderTextLayer) return;
		void page.getStructTree().then((tree) => {
			if (!active) return;
			setStructTree(tree);
			if (tree) onGetStructTreeSuccess?.(tree);
		}).catch((caught: unknown) => {
			if (!active) return;
			const error =
				caught instanceof Error ? caught : new Error(String(caught));
			setStructTree(null);
			onGetStructTreeError?.(error);
		});
		return () => {
			active = false;
		};
	}, [customTextRenderer, page, renderTextLayer]);

	const contextValue =
		page && viewport && pageIndex != null && pageNumber != null
			? {
					page,
					pageIndex,
					pageNumber,
					rotate: viewport.rotation,
					scale: viewport.scale,
				}
			: null;

	let content: unknown;
	if (!pageNumber) {
		content = <div class="react-pdf__message react-pdf__message--no-data">{renderMessage(
			noData,
		)}</div>;
	} else if (pdf === false || page === false || pageError) {
		content = <div class="react-pdf__message react-pdf__message--error">{renderMessage(
			error,
		)}</div>;
	} else if (!page || !viewport || !contextValue) {
		content = <div class="react-pdf__message react-pdf__message--loading">{renderMessage(
			loading,
		)}</div>;
	} else {
		if (renderMode === 'custom' && !customRenderer) {
			throw new Error('renderMode was set to "custom", but no customRenderer was passed.');
		}
		const renderProps = contextValue as PageRenderProps;
		content = <PageContext.Provider value={contextValue}>
			{renderMode === 'canvas'
				? <canvas
						ref={canvasElement}
						class="react-pdf__Page__canvas"
						dir="ltr"
						style={{ display: 'block', userSelect: 'none' }}
					>
						{renderTextLayer && structTree
							? <StructTreeItem
									className="react-pdf__Page__structTree structTree"
									node={structTree}
								/>
							: null}
					</canvas>
				: null}
			{renderMode === 'custom' && customRenderer ? createElement(customRenderer, {}) : null}
			{renderTextLayer
				? <div ref={textElement} class="react-pdf__Page__textContent textLayer" />
				: null}
			{renderAnnotationLayer
				? <div ref={annotationElement} class="react-pdf__Page__annotations annotationLayer" />
				: null}
			{typeof children === 'function' && !isChildrenBlock(children)
				? children(renderProps)
				: children}
		</PageContext.Provider>;
	}

	return <div
		{...withEventData(hostProps, page && viewport ? makePageCallback(page, viewport) : page)}
		ref={pageElement}
		class={[_className, classProp, className]}
		data-page-number={pageNumber}
		style={{
			'--scale-round-x': '1px',
			'--scale-round-y': '1px',
			'--scale-factor': '1',
			'--user-unit': `${viewport?.scale ?? scaleProp}`,
			'--total-scale-factor': 'calc(var(--scale-factor) * var(--user-unit))',
			backgroundColor: canvasBackground || 'white',
			minHeight: 'min-content',
			minWidth: 'min-content',
			position: 'relative',
		} as never}
	>{content}</div>;
}

export function Thumbnail(props: ThumbnailProps = {}) {
	const documentContext = useDocumentContext();
	const merged = { ...documentContext, ...props } as ThumbnailProps & DocumentContextValue;
	const { class: classProp, className, onItemClick, pageIndex, pageNumber, pdf } = merged;
	if (!pdf) {
		throw new Error('Attempted to load a thumbnail, but no document was specified.');
	}
	const resolvedPageNumber = pageNumber ?? (pageIndex != null ? pageIndex + 1 : undefined);
	const resolvedPageIndex =
		resolvedPageNumber != null ? resolvedPageNumber - 1 : 0;

	function handleClick(event: MouseEvent) {
		event.preventDefault();
		if (resolvedPageNumber == null) return;
		const args = { pageIndex: resolvedPageIndex, pageNumber: resolvedPageNumber };
		if (onItemClick) onItemClick(args);
		else if (documentContext?.linkService) documentContext.linkService.goToPage(resolvedPageNumber);
		else throw new Error('Either onItemClick callback or linkService must be defined in order to navigate to an outline item.');
	}

	const { class: _class, className: _className, onItemClick: _onItemClick, ...pageProps } = props;
	return <a
		class={['react-pdf__Thumbnail', classProp, className]}
		href={resolvedPageNumber ? '#' : undefined}
		onClick={handleClick}
	>
		<Page
			{...pageProps}
			_className="react-pdf__Thumbnail__page"
			_enableRegisterUnregisterPage={false}
			pageIndex={pageIndex}
			pageNumber={pageNumber}
			renderAnnotationLayer={false}
			renderTextLayer={false}
		/>
	</a>;
}

type OutlineEntry = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];

function OutlineItem({
	item,
	linkService,
	pdf,
	onItemClick,
}: {
	item: OutlineEntry;
	linkService?: LinkService;
	pdf: PDFDocumentProxy;
	onItemClick?: OutlineProps['onItemClick'];
}) {
	async function activate(event: Event) {
		event.preventDefault();
		if (!onItemClick && !linkService) {
			throw new Error('Either onItemClick callback or linkService must be defined in order to navigate to an outline item.');
		}
		if (!onItemClick) {
			void linkService?.goToDestination(item.dest);
			return;
		}
		const dest =
			typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
		if (!dest) throw new Error('Destination not found.');
		const reference = dest[0];
		const pageIndex =
			typeof reference === 'number' ? reference : await pdf.getPageIndex(new Ref(reference));
		const args = { dest, pageIndex, pageNumber: pageIndex + 1 };
		onItemClick(args);
	}

	return <li>
		<a href="#" onClick={activate}>{item.title}</a>
		{item.items?.length
			? <ul>{item.items.map(
					(child) =>
						<OutlineItem
							item={child}
							linkService={linkService}
							pdf={pdf}
							onItemClick={onItemClick}
						/>,
				)}</ul>
			: null}
	</li>;
}

export function Outline(props: OutlineProps = {}) {
	const documentContext = useDocumentContext();
	const {
		class: classProp,
		className,
		inputRef,
		onItemClick,
		onLoadError,
		onLoadSuccess,
		pdf = documentContext?.pdf,
		...hostProps
	} = props;
	const outlineElement = useRef<HTMLDivElement | null>(null);
	const [outline, setOutline] = useState<
		Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined
	>();
	const [failed, setFailed] = useState(false);
	if (!pdf) {
		throw new Error('Attempted to load an outline, but no document was specified.');
	}

	useEffect(() => {
		setRef(inputRef, outlineElement.current);
		return () => setRef(inputRef, null);
	}, [inputRef]);

	useEffect(() => {
		let active = true;
		setOutline(undefined);
		setFailed(false);
		void pdf.getOutline().then((nextOutline) => {
			if (!active) return;
			setOutline(nextOutline);
			onLoadSuccess?.(nextOutline);
		}).catch((caught: unknown) => {
			if (!active) return;
			const error =
				caught instanceof Error ? caught : new Error(String(caught));
			setFailed(true);
			onLoadError?.(error);
		});
		return () => {
			active = false;
		};
	}, [pdf]);

	if (failed || !outline) return null;
	const clickHandler = onItemClick ?? documentContext?.onItemClick;
	return <div
		{...withEventData(hostProps, outline)}
		ref={outlineElement}
		class={['react-pdf__Outline', classProp, className]}
	>
		<OutlineContext.Provider value={{ onItemClick: clickHandler }}>
			<ul>{outline.map(
				(item) =>
					<OutlineItem
						item={item}
						linkService={documentContext?.linkService}
						pdf={pdf}
						onItemClick={clickHandler}
					/>,
			)}</ul>
		</OutlineContext.Provider>
	</div>;
}
