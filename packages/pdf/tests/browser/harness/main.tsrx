import { Document, Outline, Page, Thumbnail, pdfjs } from '@octanejs/pdf';
import { createRoot, delegateEvents, hydrateRoot, useMemo, useState } from 'octane';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
	createElement as createReactElement,
	useMemo as useReactMemo,
	useState as useReactState,
} from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { Document as ReactDocument, Page as ReactPage, pdfjs as reactPdfjs } from 'react-pdf';

import { createProbePdf } from '../../feasibility/fixture';
import { PdfHydrationFixture } from './hydration.tsrx';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
reactPdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const NativeWorker = window.Worker;
let workerCreations = 0;
let workerTerminations = 0;
window.Worker = class TrackedPdfWorker extends NativeWorker {
	constructor(scriptURL: string | URL, options?: WorkerOptions) {
		super(scriptURL, options);
		workerCreations += 1;
	}

	override terminate() {
		workerTerminations += 1;
		document.querySelector('#binding-probe')?.setAttribute(
			'data-worker-terminations',
			String(workerTerminations),
		);
		return super.terminate();
	}
};

function BrowserHarness() {
	const file = useMemo(() => ({ data: createProbePdf() }), []);
	const [documentReady, setDocumentReady] = useState(false);
	const [canvasReady, setCanvasReady] = useState(false);
	const [textReady, setTextReady] = useState(false);
	const [annotationsReady, setAnnotationsReady] = useState(false);
	const [outlineReady, setOutlineReady] = useState(false);
	const [pageLoaded, setPageLoaded] = useState(false);
	const [renderError, setRenderError] = useState('');
	const [workerCount, setWorkerCount] = useState(0);
	const [itemClick, setItemClick] = useState('');
	const [thumbnailClick, setThumbnailClick] = useState('');
	const [width, setWidth] = useState(300);
	const [mounted, setMounted] = useState(true);
	const [customTextReady, setCustomTextReady] = useState(false);
	const [documentEventValue, setDocumentEventValue] = useState('');
	const [pageEventValue, setPageEventValue] = useState('');
	const [outlineEventValue, setOutlineEventValue] = useState('');
	const [loadError, setLoadError] = useState('');
	const ready =
		documentReady && canvasReady && textReady && annotationsReady && outlineReady &&
			customTextReady;

	return <main
		id="binding-probe"
		data-status={ready ? 'ready' : 'loading'}
		data-worker-count={workerCount}
		data-document-ready={documentReady}
		data-canvas-ready={canvasReady}
		data-text-ready={textReady}
		data-annotations-ready={annotationsReady}
		data-outline-ready={outlineReady}
		data-page-loaded={pageLoaded}
		data-render-error={renderError}
		data-item-click={itemClick}
		data-thumbnail-click={thumbnailClick}
		data-worker-terminations={workerTerminations}
		data-document-event-value={documentEventValue}
		data-page-event-value={pageEventValue}
		data-outline-event-value={outlineEventValue}
		data-load-error={loadError}
	>
		<button id="resize-binding" onClick={() => setWidth(200)}>Resize</button>
		<button id="unmount-binding" onClick={() => setMounted(false)}>Unmount</button>
		{mounted
			? <Document
					file={file}
					onMouseMove={(_event, currentDocument) => setDocumentEventValue(
						currentDocument ? String(currentDocument.numPages) : '',
					)}
					onItemClick={({ pageIndex, pageNumber }) => setItemClick(`${pageIndex}:${pageNumber}`)}
					onLoadSuccess={() => {
						setDocumentReady(true);
						setWorkerCount(workerCreations);
					}}
				>
					<Page
						pageNumber={1}
						width={width}
						onMouseMove={(_event, currentPage) => setPageEventValue(
							currentPage ? String(currentPage.pageNumber) : '',
						)}
						onLoadError={(error) => setRenderError(`load:${error.message}`)}
						onLoadSuccess={() => setPageLoaded(true)}
						onRenderError={(error) => setRenderError(`canvas:${error.message}`)}
						onRenderTextLayerError={(error) => setRenderError(`text:${error.message}`)}
						onRenderAnnotationLayerError={(error) => setRenderError(`annotation:${String(error)}`)}
						onRenderSuccess={() => setCanvasReady(true)}
						onRenderTextLayerSuccess={() => setTextReady(true)}
						onRenderAnnotationLayerSuccess={() => setAnnotationsReady(true)}
					/>
					<Outline
						onLoadSuccess={() => setOutlineReady(true)}
						onMouseMove={(_event, currentOutline) => setOutlineEventValue(
							currentOutline ? String(currentOutline.length) : '',
						)}
					/>
					<Thumbnail
						pageNumber={1}
						onItemClick={({ pageIndex, pageNumber }) => setThumbnailClick(
							`${pageIndex}:${pageNumber}`,
						)}
					/>
					<Page
						pageNumber={1}
						renderMode="none"
						renderAnnotationLayer={false}
						customTextRenderer={() =>
							'<strong data-safe="yes" onclick="window.__unsafe = 1">safe</strong><script>window.__unsafe = 2</script><a href=" javascript:alert(1)">link</a>'}
						onRenderTextLayerSuccess={() => setCustomTextReady(true)}
					/>
				</Document>
			: null}
		<Document
			file={{ data: new Uint8Array([0]) }}
			error="Invalid PDF"
			onLoadError={(caught) => setLoadError(caught.name)}
		/>
		<span id="custom-text-ready">{String(customTextReady)}</span>
	</main>;
}

function ReactAuthority() {
	const file = useReactMemo(() => ({ data: createProbePdf() }), []);
	const [documentReady, setDocumentReady] = useReactState(false);
	const [canvasReady, setCanvasReady] = useReactState(false);
	const [textReady, setTextReady] = useReactState(false);
	const [annotationsReady, setAnnotationsReady] = useReactState(false);
	const ready = documentReady && canvasReady && textReady && annotationsReady;

	return createReactElement(
		'main',
		{
			id: 'react-parity-probe',
			'data-status': ready ? 'ready' : 'loading',
			'data-document-ready': String(documentReady),
			'data-canvas-ready': String(canvasReady),
			'data-text-ready': String(textReady),
			'data-annotations-ready': String(annotationsReady),
		},
		createReactElement(
			ReactDocument,
			{ file, onLoadSuccess: () => setDocumentReady(true) },
			createReactElement(ReactPage, {
				pageNumber: 1,
				width: 300,
				onRenderSuccess: () => setCanvasReady(true),
				onRenderTextLayerSuccess: () => setTextReady(true),
				onRenderAnnotationLayerSuccess: () => setAnnotationsReady(true),
			}),
		),
	);
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root');
const hydrationElement = document.getElementById('hydration-root');
if (!hydrationElement) throw new Error('Missing #hydration-root');
const reactElement = document.getElementById('react-root');
if (!reactElement) throw new Error('Missing #react-root');
const serverHydrationNode = hydrationElement.firstElementChild;
delegateEvents(['click', 'mousemove']);
createRoot(rootElement).render(BrowserHarness);
hydrateRoot(hydrationElement, PdfHydrationFixture, {
	onDocumentReady() {
		hydrationElement.setAttribute(
			'data-node-preserved',
			String(hydrationElement.firstElementChild === serverHydrationNode),
		);
	},
	onPageReady() {
		hydrationElement.setAttribute('data-ready', 'true');
	},
});
createReactRoot(reactElement).render(createReactElement(ReactAuthority));
