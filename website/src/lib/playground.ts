// Playground engine — compiles TSRX/TSX in the browser with the REAL
// `octane/compiler` (it's pure JS: @tsrx/core parser + esrap printer, no Node
// APIs) and executes the compiled module graph for the live preview.
//
// Execution model: compilation happens here (pure parsing, no authority), but
// the compiled modules EXECUTE inside a sandboxed iframe with an opaque origin
// (see playground-sandbox.ts) — never in the website's own page. Hash-shared
// playground links carry arbitrary code, so the page it runs in must have no
// same-origin storage, cookies, or DOM to steal. The parent fetches the octane
// runtime chunk manifest (served by the playgroundRuntime() vite plugin) and
// hands it to the iframe, which builds blob modules on its own side of the
// boundary. Multi-file graphs and third-party esm.sh imports are prepared by
// playground-modules.ts.
//
// Client-only: load via dynamic import from an effect (never during SSR).
import { compile, type CompileDiagnostic } from 'octane/compiler';
import {
	sandboxSrcdoc,
	RUNTIME_MANIFEST_PATH,
	PROTOCOL_KEY,
	type RuntimeManifest,
} from './playground-sandbox.ts';

export type { CompileDiagnostic };

export type PlaygroundLang = 'tsrx' | 'tsx';

export interface CompileSuccess {
	ok: true;
	code: string;
	warnings: CompileDiagnostic[];
}

export interface CompileFailure {
	ok: false;
	error: string;
}

/**
 * Compile one playground file for the client runtime. Never throws. The
 * filename is the virtual file's real name (e.g. `Island.tsrx`) so diagnostics
 * and scoped-style hashes reference it.
 */
export function compilePlayground(
	source: string,
	filename: string,
): CompileSuccess | CompileFailure {
	try {
		const out = compile(source, filename, { mode: 'client' });
		return { ok: true, code: out.code, warnings: out.diagnostics };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

// ── Sandboxed execution ─────────────────────────────────────────────────────

/** The subset of a built module graph the sandbox needs to execute a run. */
export interface RunPayload {
	entry: string;
	entryKind: 'octane' | 'react';
	modules: { name: string; code: string }[];
}

export interface Preview {
	/** Execute a compiled playground module graph and render its entry component. Never throws. */
	run(payload: RunPayload): Promise<{ error: string | null }>;
	destroy(): void;
}

export const PREVIEW_READY_TIMEOUT_MS = 10_000;
export const PREVIEW_RUN_TIMEOUT_MS = 10_000;

/**
 * A live preview bound to `container` — creates the sandboxed iframe and
 * drives the postMessage protocol (see playground-sandbox.ts for the boundary
 * design). `onRuntimeError` reports errors thrown AFTER the initial render
 * resolves (effects, event handlers — caught by the error boundary the sandbox
 * wraps around the user component).
 */
export function createPreview(
	container: Element,
	onRuntimeError: (message: string) => void,
): Preview {
	const doc = container.ownerDocument;
	const win = doc.defaultView!;

	const iframe = doc.createElement('iframe');
	// allow-scripts WITHOUT allow-same-origin: the sandbox document gets an
	// opaque origin — no cookies, storage, or parent DOM. allow-forms only
	// lets submit events fire (the srcdoc CSP still blocks real submission).
	iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
	iframe.setAttribute('title', 'Playground preview');
	iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
	iframe.srcdoc = sandboxSrcdoc();
	container.appendChild(iframe);
	const frameWindow = iframe.contentWindow;

	let destroyed = false;
	let generation = 0;
	const pending = new Map<
		number,
		{
			resolve: (result: { error: string | null }) => void;
			timeout: number;
		}
	>();
	const send = (msg: Record<string, unknown>) => {
		frameWindow?.postMessage({ [PROTOCOL_KEY]: true, ...msg }, '*');
	};
	const settlePending = (gen: number, result: { error: string | null }) => {
		const entry = pending.get(gen);
		if (!entry) return;
		pending.delete(gen);
		win.clearTimeout(entry.timeout);
		entry.resolve(result);
	};

	// Resolves once the sandbox has imported the runtime bundle; resolves with
	// an actionable error string when the iframe is unavailable, fails to boot,
	// or boots but never acknowledges the runtime bundle.
	let cleanupListener: (() => void) | undefined;
	let settleReady: (error: string | null) => void = () => {};
	const ready = frameWindow
		? new Promise<string | null>((resolve) => {
				let settled = false;
				let bootReceived = false;
				const readyTimeout = win.setTimeout(() => {
					settleReady(
						bootReceived
							? 'Preview sandbox booted but did not become ready before the timeout.'
							: 'Preview sandbox did not boot before the timeout (iframe scripts may be unavailable).',
					);
				}, PREVIEW_READY_TIMEOUT_MS);
				settleReady = (error) => {
					if (settled) return;
					settled = true;
					win.clearTimeout(readyTimeout);
					resolve(error);
				};
				const onMessage = (event: MessageEvent) => {
					if (destroyed || event.source !== frameWindow) return;
					const msg = event.data;
					if (!msg || msg[PROTOCOL_KEY] !== true) return;
					switch (msg.type) {
						case 'boot':
							bootReceived = true;
							// Sandbox is listening — hand it the runtime chunk manifest (it
							// cannot fetch same-origin resources itself; see sandbox notes).
							fetch(RUNTIME_MANIFEST_PATH)
								.then((res) => {
									if (!res.ok) throw new Error(`${RUNTIME_MANIFEST_PATH} → HTTP ${res.status}`);
									return res.json() as Promise<RuntimeManifest>;
								})
								.then((manifest) => send({ type: 'init', manifest }))
								.catch((error) =>
									settleReady(
										'Failed to load the preview runtime: ' +
											(error instanceof Error ? error.message : String(error)),
									),
								);
							break;
						case 'ready':
							settleReady(typeof msg.error === 'string' ? msg.error : null);
							break;
						case 'result': {
							settlePending(msg.gen, { error: typeof msg.error === 'string' ? msg.error : null });
							break;
						}
						case 'runtime-error':
							// Only the CURRENT run's errors reach the banner — a late
							// error from a superseded run (a timer firing after a
							// recompile) must not stick over the newer run's clean render.
							if (msg.gen === generation && typeof msg.error === 'string') {
								onRuntimeError(msg.error);
							}
							break;
					}
				};
				win.addEventListener('message', onMessage);
				cleanupListener = () => {
					win.removeEventListener('message', onMessage);
				};
			})
		: Promise.resolve('Preview iframe is unavailable in this browser environment.');

	return {
		async run(payload) {
			const gen = ++generation;
			const readyError = await ready;
			if (destroyed || gen !== generation) return { error: null }; // superseded
			if (readyError) return { error: readyError };

			// A newer run supersedes any still-pending one — resolve it quietly so
			// the caller's error handling never fires for stale results.
			for (const staleGen of pending.keys()) {
				settlePending(staleGen, { error: null });
			}
			return new Promise((resolve) => {
				const timeout = win.setTimeout(() => {
					settlePending(gen, {
						error: 'Preview sandbox did not return a render result before the timeout.',
					});
				}, PREVIEW_RUN_TIMEOUT_MS);
				pending.set(gen, { resolve, timeout });
				send({
					type: 'run',
					gen,
					entry: payload.entry,
					entryKind: payload.entryKind,
					modules: payload.modules,
				});
			});
		},
		destroy() {
			destroyed = true;
			settleReady(null);
			cleanupListener?.();
			for (const gen of pending.keys()) settlePending(gen, { error: null });
			iframe.remove();
		},
	};
}
