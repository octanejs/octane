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
import { compileTypesInspection } from 'octane/compiler/volar';
import {
	sandboxSrcdoc,
	RUNTIME_MANIFEST_PATH,
	PROTOCOL_KEY,
	type RuntimeManifest,
} from './playground-sandbox.ts';
import type { InspectAlias, InspectSegment, InspectTemplate } from './playground-mapping.ts';

export type { CompileDiagnostic };

export type PlaygroundLang = 'tsrx' | 'tsx';
export type PlaygroundRuntimeTarget = 'client' | 'server';
export type PlaygroundOutputTarget = PlaygroundRuntimeTarget | 'types' | 'source';

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
	mode: PlaygroundRuntimeTarget = 'client',
): CompileSuccess | CompileFailure {
	try {
		const out = compile(source, filename, { mode });
		return { ok: true, code: out.code, warnings: out.diagnostics };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export interface TypesSuccess {
	ok: true;
	/** The typed virtual TSX the language service analyses. */
	code: string;
	/** Position artifacts for the code pane (see playground-mapping.ts). */
	segments: InspectSegment[];
	/** Authored parser tree and the exact Program printed as typed virtual TSX. */
	sourceAst: unknown;
	generatedAst: unknown;
}

export interface RuntimeSuccess {
	ok: true;
	/** The emitted module — byte-identical to a non-inspect compile. */
	code: string;
	warnings: CompileDiagnostic[];
	/** The final Program plus hoisted template IR, for the AST pane. */
	ast: unknown;
	/** Position artifacts for the code pane (see playground-mapping.ts). */
	segments: InspectSegment[];
	templates: InspectTemplate[];
	aliases: InspectAlias[];
}

/**
 * Compile one file for the COMPILED PANE with inspection enabled: one compile
 * yields the emitted code, the final Program, and the position artifacts, so
 * flipping between Code and AST (or hovering for a mapping) never recompiles.
 * The preview's module graph keeps using `compilePlayground`, so a run that
 * never opens the pane still pays no inspection cost. Never throws.
 */
export function compileRuntime(
	source: string,
	filename: string,
	mode: PlaygroundRuntimeTarget,
): RuntimeSuccess | CompileFailure {
	try {
		const result = compile(source, filename, { mode, inspect: true });
		if (!result.inspect) throw new Error('Compiler inspection result is unavailable.');
		const { ast, templates, segments, aliases } = result.inspect;
		return {
			ok: true,
			code: result.code,
			warnings: result.diagnostics,
			ast: {
				program: ast,
				// Only hoisted CLIENT templates carry IR. The server's entries are
				// static runs — position data for the code pane, with no tree to
				// show — so they are left out of the AST view rather than filling
				// it with `{ name: null, ast: null }` rows.
				templates: templates
					.filter((template) => template.ast != null)
					.map(({ name, ast: tree }) => ({ name, ast: tree })),
			},
			segments: segments as InspectSegment[],
			aliases: (aliases ?? []) as InspectAlias[],
			templates: templates.map(({ html, raw, origins }) => ({ html, raw, origins })),
		};
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Generate the TYPES view of a playground file: the same typed virtual TSX the
 * IDE language service sees, not the runtime emit.
 *
 * Uses the NAVIGATION entry, not `compileToVolarMappings`. The editor's
 * mappings carry Volar capability data and are shaped for its position
 * queries; this pane wants exact authored ranges — including the END a Volar
 * mapping cannot express — and must not be able to perturb the editor to get
 * them. Same parse, same transform, same output bytes; only the position
 * artifact differs, so it is the same `segments` shape the runtime targets use.
 * Never throws.
 */
export function compileTypes(source: string, filename: string): TypesSuccess | CompileFailure {
	try {
		const out = compileTypesInspection(source, filename);
		return {
			ok: true,
			code: out.code,
			segments: out.segments as InspectSegment[],
			sourceAst: out.sourceAst,
			generatedAst: out.generatedAst,
		};
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
	const currentTheme = (): 'light' | 'dark' =>
		doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

	const iframe = doc.createElement('iframe');
	// allow-scripts WITHOUT allow-same-origin: the sandbox document gets an
	// opaque origin — no cookies, storage, or parent DOM. allow-forms only
	// lets submit events fire (the srcdoc CSP still blocks real submission).
	iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
	iframe.setAttribute('title', 'Playground preview');
	iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
	iframe.srcdoc = sandboxSrcdoc(currentTheme());
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
							// The srcdoc carried the theme at creation time; re-send it in
							// case the toggle flipped before the sandbox started listening.
							send({ type: 'theme', theme: currentTheme() });
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

	// Keep the sandbox's theme in sync with the site's ThemeToggle (it flips
	// `data-theme` on <html>; an opaque-origin iframe can't observe the parent).
	let themeObserver: MutationObserver | null = null;
	if (typeof win.MutationObserver === 'function') {
		themeObserver = new win.MutationObserver(() => {
			send({ type: 'theme', theme: currentTheme() });
		});
		themeObserver.observe(doc.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		});
	}

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
			themeObserver?.disconnect();
			cleanupListener?.();
			for (const gen of pending.keys()) settlePending(gen, { error: null });
			iframe.remove();
		},
	};
}
