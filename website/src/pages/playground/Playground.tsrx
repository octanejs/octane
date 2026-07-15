// /playground — write TSRX (or TSX) on the left, and on the right either the
// LIVE rendered app or the compiled octane output, switchable with a tab. The
// whole pipeline runs in the browser: `octane/compiler` compiles on a debounce,
// the compiled module executes inside a SANDBOXED IFRAME with an opaque origin
// (see src/lib/playground.ts + playground-sandbox.ts — never in this page),
// and CodeMirror highlights through Shiki with the real TSRX TextMate grammar
// (src/lib/shiki-codemirror.ts).
//
// Everything editor-related boots in an effect (dynamic imports), so SSR
// renders just the static shell and hydration stays clean. The source for each
// language mode is kept in its own buffer — switching modes round-trips your
// edits. The current source + mode also persist into `location.hash` (debounced)
// so playground states are shareable links.
//
// Shared links are UNTRUSTED input: a hash payload is decoded into the editor
// and compiled (source + compiled output are safe to display), but it does NOT
// execute — even in the sandbox — until the visitor explicitly presses "Run"
// on the consent overlay. Your own edits from the default sources auto-run as
// before.
import { useState, useRef, useEffect } from 'octane';
import type { PlaygroundLang } from '../../lib/playground.ts';
import {
	decodePlaygroundHash,
	encodePlaygroundHash,
	MAX_PLAYGROUND_SOURCE_LENGTH,
	PLAYGROUND_SOURCE_LIMIT_ERROR,
} from '../../lib/playground-hash.ts';

const HASH_DEBOUNCE_MS = 400;
const COMPILE_DEBOUNCE_MS = 250;

export function Playground() @{
	const [lang, setLang] = useState<PlaygroundLang>('tsrx');
	const [view, setView] = useState<'preview' | 'compiled'>('preview');
	// Mobile only: which panel is visible (desktop always shows both).
	const [pane, setPane] = useState<'editor' | 'result'>('editor');
	const [error, setError] = useState('');
	const [ready, setReady] = useState(false);
	// True while a hash-shared payload is loaded but not yet approved to run.
	const [gated, setGated] = useState(false);

	const sourceHostRef = useRef<HTMLDivElement | null>(null);
	const outputHostRef = useRef<HTMLDivElement | null>(null);
	const previewHostRef = useRef<HTMLDivElement | null>(null);
	// Imperative bridge into the boot closure below — populated once the editor
	// stack has loaded; the mode buttons (and the consent overlay's Run button)
	// call through it.
	const controllerRef = useRef<
		{
			switchLang?: (next: PlaygroundLang) => void;
			approveRun?: () => void;
		}
	>({});

	useEffect(() => {
		const sourceHost = sourceHostRef.current;
		const outputHost = outputHostRef.current;
		const previewHost = previewHostRef.current;
		if (!sourceHost || !outputHost || !previewHost) return;

		let disposed = false;
		let sourceView: any;
		let outputView: any;
		let preview: | { run(code: string): Promise<{ error: string | null }>; destroy(): void }
		| null = null;
		let compileDebounceId = 0;
		let hashDebounceId = 0;
		// Validate the URL payload before loading CodeMirror, Shiki, or the
		// compiler. Oversized input is ignored in favor of the bounded defaults.
		const hashResult = decodePlaygroundHash(window.location.hash.slice(1));
		const initial = hashResult.ok ? hashResult.value : null;
		const initialDiagnostic = hashResult.ok ? '' : hashResult.error;
		if (initialDiagnostic) setError(initialDiagnostic);

		(async () => {
			let stateMod: any, commandsMod: any, viewMod: any, shikiMod: any, pg: any;
			try {
				[stateMod, commandsMod, viewMod, shikiMod, pg] = await Promise.all([
					import('@codemirror/state'),
					import('@codemirror/commands'),
					import('@codemirror/view'),
					import('../../lib/shiki-codemirror.ts'),
					import('../../lib/playground.ts'),
				]);
			} catch (bootError) {
				// A load failure after unmount (e.g. a test env torn down mid-import)
				// must not become an unhandled rejection; while mounted, surface it.
				if (!disposed) {
					setError(bootError instanceof Error ? bootError.message : String(bootError));
				}
				return;
			}
			if (disposed) return;

			const { EditorState, Compartment } = stateMod;
			const { history, defaultKeymap, historyKeymap, indentWithTab } = commandsMod;
			const { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } = viewMod;
			const { shikiHighlight } = shikiMod;

			let currentLang: PlaygroundLang = initial?.lang ?? 'tsrx';
			const buffers: Record<PlaygroundLang, string> = {
				tsrx: pg.DEFAULT_SOURCES.tsrx,
				tsx: pg.DEFAULT_SOURCES.tsx,
			};
			// A hash payload is someone else's code — display + compile it, but
			// gate EXECUTION behind the consent overlay's Run button. A payload
			// byte-equal to the default source carries nothing new, so it stays
			// ungated.
			let executionGated = false;
			if (initial) {
				buffers[currentLang] = initial.source;
				setLang(currentLang);
				if (initial.source !== pg.DEFAULT_SOURCES[currentLang]) {
					executionGated = true;
					setGated(true);
				}
			}

			const sourceLangCompartment = new Compartment();

			// github-dark canvas so the Shiki token colors sit on the palette they
			// were designed for.
			const sharedTheme = EditorView.theme(
				{
					'&': {
						height: '100%',
						backgroundColor: '#0d1117',
						color: '#e6edf3',
						fontSize: '0.85rem',
					},
					'.cm-scroller': {
						overflow: 'auto',
						fontFamily: 'ui-monospace, SFMono-Regular, \'SF Mono\', Menlo, Consolas, \'Liberation Mono\', monospace',
					},
					'.cm-content': { padding: '1rem 0.25rem 1.25rem' },
					'.cm-gutters': {
						backgroundColor: '#0d1117',
						color: 'rgba(230, 237, 243, 0.35)',
						border: 'none',
					},
					'.cm-activeLine, .cm-activeLineGutter': {
						backgroundColor: 'rgba(110, 118, 129, 0.12)',
					},
					'.cm-selectionBackground': {
						backgroundColor: 'rgba(56, 139, 253, 0.35) !important',
					},
					'.cm-cursor': { borderLeftColor: '#e6edf3' },
				},
				{ dark: true },
			);

			preview = pg.createPreview(previewHost, (message) => {
				if (!disposed) setError(message);
			});

			const replaceDoc = (view: any, doc: string) => {
				view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
			};

			const compileAndRun = (source: string) => {
				if (disposed) return;
				if (source.length > MAX_PLAYGROUND_SOURCE_LENGTH) {
					setError(PLAYGROUND_SOURCE_LIMIT_ERROR);
					return;
				}
				const result = pg.compilePlayground(source, currentLang);
				if (!result.ok) {
					setError(result.error);
					return;
				}
				setError('');
				replaceDoc(outputView, result.code);
				// While a shared payload is gated, everything except EXECUTION
				// happens — the visitor can inspect source and compiled output.
				if (executionGated) return;
				void preview!.run(result.code).then((r) => {
					if (!disposed && r.error) setError(r.error);
				});
			};

			// replaceState (not the router) — only the hash on the current entry
			// changes, so the router's history wiring never sees it.
			const updateHash = (source: string) => {
				window.clearTimeout(hashDebounceId);
				hashDebounceId = window.setTimeout(() => {
					const encoded = encodePlaygroundHash(source, currentLang);
					if (encoded) window.history.replaceState(null, '', '#' + encoded);
				}, HASH_DEBOUNCE_MS);
			};

			sourceView = new EditorView({
				state: EditorState.create({
					doc: buffers[currentLang],
					extensions: [
						EditorState.changeFilter.of((transaction: any) => {
							if (!transaction.docChanged) return true;
							if (transaction.newDoc.length <= MAX_PLAYGROUND_SOURCE_LENGTH) return true;
							setError(PLAYGROUND_SOURCE_LIMIT_ERROR);
							return false;
						}),
						lineNumbers(),
						history(),
						drawSelection(),
						highlightActiveLine(),
						keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
						EditorView.lineWrapping,
						EditorState.tabSize.of(2),
						sourceLangCompartment.of(shikiHighlight(currentLang)),
						sharedTheme,
						EditorView.updateListener.of((update: any) => {
							if (!update.docChanged) return;
							const next = update.state.doc.toString();
							buffers[currentLang] = next;
							window.clearTimeout(compileDebounceId);
							compileDebounceId = window.setTimeout(() => {
								compileAndRun(next);
							}, COMPILE_DEBOUNCE_MS);
							updateHash(next);
						}),
					],
				}),
				parent: sourceHost,
			});

			outputView = new EditorView({
				state: EditorState.create({
					doc: '// Compiled output appears here.',
					extensions: [
						lineNumbers(),
						EditorState.readOnly.of(true),
						EditorView.editable.of(false),
						EditorView.lineWrapping,
						shikiHighlight('tsx'),
						sharedTheme,
					],
				}),
				parent: outputHost,
			});

			controllerRef.current.switchLang = (next) => {
				if (next === currentLang || disposed) return;
				buffers[currentLang] = sourceView.state.doc.toString();
				currentLang = next;
				replaceDoc(sourceView, buffers[next]);
				sourceView.dispatch({
					effects: sourceLangCompartment.reconfigure(shikiHighlight(next)),
				});
				window.clearTimeout(compileDebounceId);
				compileAndRun(buffers[next]);
				updateHash(buffers[next]);
			};

			controllerRef.current.approveRun = () => {
				if (disposed || !executionGated) return;
				executionGated = false;
				setGated(false);
				buffers[currentLang] = sourceView.state.doc.toString();
				compileAndRun(buffers[currentLang]);
			};

			compileAndRun(buffers[currentLang]);
			if (initialDiagnostic) setError(initialDiagnostic);
			setReady(true);
		})();

		return () => {
			disposed = true;
			controllerRef.current.switchLang = undefined;
			controllerRef.current.approveRun = undefined;
			window.clearTimeout(compileDebounceId);
			window.clearTimeout(hashDebounceId);
			sourceView?.destroy();
			outputView?.destroy();
			preview?.destroy();
		};
	}, []);

	<div class="pg">
		<div class="pg-toolbar">
			<div class="pg-toolbar-side">
				<div class="pg-seg" role="group" aria-label="Source language">
					<button
						type="button"
						class={['pg-seg-btn', lang === 'tsrx' && 'active']}
						disabled={!ready}
						onClick={() => {
							setLang('tsrx');
							controllerRef.current.switchLang?.('tsrx');
						}}
					>
						TSRX
					</button>
					<button
						type="button"
						class={['pg-seg-btn', lang === 'tsx' && 'active']}
						disabled={!ready}
						onClick={() => {
							setLang('tsx');
							controllerRef.current.switchLang?.('tsx');
						}}
					>
						TSX
					</button>
				</div>
			</div>
			<div class="pg-seg" role="group" aria-label="Result view">
				<button
					type="button"
					class={['pg-seg-btn', view === 'preview' && 'active']}
					onClick={() => setView('preview')}
				>
					Preview
				</button>
				<button
					type="button"
					class={['pg-seg-btn', view === 'compiled' && 'active']}
					onClick={() => setView('compiled')}
				>
					Compiled output
				</button>
			</div>
		</div>

		@if (error) {
			<div class="pg-error" role="alert">{error}</div>
		}

		<div class={['pg-grid', ready && 'ready']}>
			<section
				class={['pg-panel', pane !== 'editor' && 'mobile-hidden']}
				aria-label="Source editor"
			>
				<div class="pg-panel-head">
					<span>
						{'Source · .' + lang}
					</span>
					@if (!ready) {
						<span class="pg-loading">Loading editor…</span>
					}
				</div>
				<div class="pg-editor" ref={sourceHostRef} />
			</section>

			<section class={['pg-panel', pane !== 'result' && 'mobile-hidden']} aria-label="Result">
				<div class="pg-panel-head">
					<span>
						{view === 'preview' ? 'Live preview' : 'Compiled for the octane runtime'}
					</span>
				</div>
				<div class={['pg-result', view !== 'preview' && 'hidden']}>
					<div class="pg-preview" ref={previewHostRef} />
					@if (gated) {
						<div class="pg-consent" role="alertdialog" aria-label="Run shared code?">
							<div class="pg-consent-card">
								<strong>This link contains shared code.</strong>
								<p>
									It was written by whoever sent you this link. Review it in the editor (and the
									compiled output) — it runs in a sandbox, but only after you choose to run it.
								</p>
								<button
									type="button"
									class="pg-consent-run"
									disabled={!ready}
									onClick={() => controllerRef.current.approveRun?.()}
								>
									Run code
								</button>
							</div>
						</div>
					}
				</div>
				<div class={['pg-editor', view !== 'compiled' && 'hidden']} ref={outputHostRef} />
			</section>
		</div>

		<div class="pg-mobile-toggle" role="group" aria-label="Visible panel">
			<button
				type="button"
				class={['pg-seg-btn', pane === 'editor' && 'active']}
				onClick={() => setPane('editor')}
			>
				Editor
			</button>
			<button
				type="button"
				class={['pg-seg-btn', pane === 'result' && 'active']}
				onClick={() => setPane('result')}
			>
				Result
			</button>
		</div>

		<style>
			.pg {
				display: flex;
				flex-direction: column;
				/* Fill the viewport below the sticky nav (60px + 1px border), edge to
				   edge — the layout renders no footer on this page, so nothing
				   scrolls. dvh tracks mobile browser chrome. */
				height: calc(100vh - 61px);
				height: calc(100dvh - 61px);
			}
			.pg-toolbar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
				padding: 0.65rem 1rem;
			}
			.pg-toolbar-side {
				display: flex;
				align-items: center;
				gap: 1rem;
			}
			.pg-seg {
				display: inline-flex;
				padding: 3px;
				border-radius: 9999px;
				border: 1px solid rgba(255, 255, 255, 0.1);
				background: rgba(255, 255, 255, 0.04);
			}
			.pg-seg-btn {
				border: none;
				background: transparent;
				color: #99a1b3;
				font: inherit;
				font-size: 0.85rem;
				font-weight: 500;
				padding: 0.3rem 0.9rem;
				border-radius: 9999px;
				cursor: pointer;
			}
			.pg-seg-btn:hover:not(:disabled) {
				color: #f4eee8;
			}
			.pg-seg-btn.active {
				color: #ff5d72;
				background: rgba(255, 65, 90, 0.14);
			}
			.pg-seg-btn:disabled {
				opacity: 0.5;
				cursor: default;
			}
			.pg-error {
				padding: 0.6rem 1rem;
				border-top: 1px solid rgba(255, 93, 114, 0.4);
				background: rgba(255, 65, 90, 0.12);
				color: #ff8d9d;
				font-size: 0.85rem;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				white-space: pre-wrap;
			}
			.pg-grid {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
				flex: 1;
				min-height: 320px;
			}
			.pg-mobile-toggle {
				display: none;
			}
			.pg-panel {
				display: flex;
				flex-direction: column;
				min-width: 0;
				min-height: 0;
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				overflow: hidden;
				background: #0d1117;
			}
			.pg-panel + .pg-panel {
				border-left: 1px solid rgba(255, 255, 255, 0.1);
			}
			.pg-panel-head {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				padding: 0.45rem 0.9rem;
				border-bottom: 1px solid rgba(255, 255, 255, 0.08);
				background: rgba(255, 255, 255, 0.03);
				color: #99a1b3;
				font-size: 0.72rem;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}
			.pg-loading {
				text-transform: none;
				letter-spacing: normal;
			}
			.pg-editor {
				flex: 1;
				min-height: 0;
			}
			.pg-editor.hidden,
			.pg-result.hidden {
				display: none;
			}
			.pg-grid:not(.ready) :global(.cm-editor) {
				opacity: 0;
			}
			.pg-editor :global(.cm-editor) {
				height: 100%;
			}
			.pg-result {
				position: relative;
				display: flex;
				flex: 1;
				min-height: 0;
			}
			/* The preview is a sandboxed iframe (opaque origin) — the content's
			   background/padding live in its srcdoc, not here. */
			.pg-preview {
				flex: 1;
				min-height: 0;
				background: #16181d;
			}
			.pg-consent {
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
				padding: 1.25rem;
				background: rgba(13, 17, 23, 0.72);
				backdrop-filter: blur(6px);
			}
			.pg-consent-card {
				max-width: 26rem;
				display: grid;
				gap: 0.6rem;
				justify-items: start;
				padding: 1.1rem 1.25rem;
				border-radius: 12px;
				border: 1px solid rgba(255, 255, 255, 0.12);
				background: #16181d;
				color: #f4eee8;
				font-size: 0.9rem;
			}
			.pg-consent-card p {
				margin: 0;
				color: #99a1b3;
			}
			.pg-consent-run {
				font: inherit;
				font-weight: 600;
				padding: 0.45rem 1.1rem;
				border-radius: 8px;
				border: 1px solid rgba(255, 93, 114, 0.5);
				background: rgba(255, 65, 90, 0.14);
				color: #ff5d72;
				cursor: pointer;
			}
			.pg-consent-run:disabled {
				opacity: 0.5;
				cursor: default;
			}
			@media (max-width: 980px) {
				.pg-toolbar {
					padding: 0.65rem 0.75rem;
				}
				/* One panel at a time — the bottom toggle switches editor ↔ result. */
				.pg-grid {
					grid-template-columns: 1fr;
				}
				.pg-panel.mobile-hidden {
					display: none;
				}
				.pg-panel + .pg-panel {
					border-left: none;
				}
				.pg-mobile-toggle {
					display: flex;
					justify-content: center;
					gap: 0.25rem;
					padding: 3px;
					border-radius: 9999px;
					border: 1px solid rgba(255, 255, 255, 0.1);
					background: rgba(35, 39, 47, 0.92);
					backdrop-filter: blur(12px);
					align-self: center;
					margin: 0.5rem auto;
				}
				.pg-mobile-toggle .pg-seg-btn {
					min-width: 6.5rem;
					padding: 0.45rem 0.9rem;
				}
			}
		</style>
	</div>
}
