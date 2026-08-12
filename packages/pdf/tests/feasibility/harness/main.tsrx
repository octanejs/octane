import { createRoot, delegateEvents, useEffect, useRef, useState } from 'octane';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createProbePdf } from '../fixture';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

declare global {
	interface Window {
		__reactPdfProbeCleanup?: boolean;
	}
}

function Probe() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const textRef = useRef<HTMLDivElement | null>(null);
	const annotationRef = useRef<HTMLDivElement | null>(null);
	const [status, setStatus] = useState('loading');
	const [worker, setWorker] = useState('unknown');
	const [outline, setOutline] = useState('');

	useEffect(() => {
		let active = true;
		let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined;
		let textLayer: { cancel: () => void } | undefined;
		const loadingTask = pdfjs.getDocument({ data: createProbePdf() });
		void (async () => {
			try {
				const pdf = await loadingTask.promise;
				if (!active) return;
				setWorker(String((loadingTask as any)._worker?.port instanceof Worker));
				const page = await pdf.getPage(1);
				const viewport = page.getViewport({ scale: 1.5 });
				const canvas = canvasRef.current!;
				canvas.width = Math.ceil(viewport.width);
				canvas.height = Math.ceil(viewport.height);
				renderTask = page.render({
					canvas,
					canvasContext: canvas.getContext('2d', { alpha: false })!,
					viewport,
				});
				await renderTask.promise;

				const textContent = await page.getTextContent();
				textLayer = new pdfjs.TextLayer({
					container: textRef.current!,
					textContentSource: textContent,
					viewport,
				});
				await (textLayer as any).render();

				const annotations = await page.getAnnotations();
				const linkService = {
					externalLinkEnabled: true,
					externalLinkRel: 'noopener noreferrer nofollow',
					externalLinkTarget: 2,
					addLinkAttributes(link: HTMLAnchorElement, url: string) {
						link.href = url;
						link.rel = this.externalLinkRel;
						link.target = '_blank';
					},
					getAnchorUrl: (hash: string) => hash || '#',
					getDestinationHash: () => '#page=1',
					goToDestination: () => {},
					executeNamedAction: () => {},
					executeSetOCGState: () => {},
					setHash: () => {},
				};
				const annotationViewport = viewport.clone({ dontFlip: true });
				const parameters = {
					accessibilityManager: null,
					annotationCanvasMap: null,
					annotationEditorUIManager: null,
					annotationStorage: pdf.annotationStorage,
					commentManager: null,
					div: annotationRef.current!,
					linkService,
					page,
					structTreeLayer: null,
					viewport: annotationViewport,
				};
				await new pdfjs.AnnotationLayer(parameters as any).render(
					{
						annotations,
						annotationStorage: pdf.annotationStorage,
						div: annotationRef.current!,
						linkService,
						page,
						renderForms: false,
						viewport: annotationViewport,
					} as any,
				);
				setOutline((await pdf.getOutline())?.[0]?.title ?? '');
				setStatus('ready');
			} catch (error) {
				if (active) setStatus(`error:${String(error)}`);
			}
		})();

		return () => {
			active = false;
			renderTask?.cancel();
			textLayer?.cancel();
			void loadingTask.destroy().then(() => {
				window.__reactPdfProbeCleanup = true;
			});
		};
	}, []);

	return <section id="probe" data-status={status} data-worker={worker} data-outline={outline}>
		<canvas id="page-canvas" ref={canvasRef} />
		<div id="text-layer" ref={textRef} />
		<div id="annotation-layer" ref={annotationRef} />
	</section>;
}

function App() {
	const [visible, setVisible] = useState(true);
	return <main>
		<button id="toggle" type="button" onClick={() => setVisible(!visible)}>toggle</button>
		{visible ? <Probe /> : null}
	</main>;
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root');

delegateEvents(['click']);
createRoot(rootElement).render(App);
