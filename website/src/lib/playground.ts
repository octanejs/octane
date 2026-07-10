// Playground engine — compiles TSRX/TSX in the browser with the REAL
// `octane/compiler` (it's pure JS: @tsrx/core parser + esrap printer, no Node
// APIs) and executes the compiled module for the live preview.
//
// Execution model: compilation happens here (pure parsing, no authority), but
// the compiled module EXECUTES inside a sandboxed iframe with an opaque origin
// (see playground-sandbox.ts) — never in the website's own page. Hash-shared
// playground links carry arbitrary code, so the page it runs in must have no
// same-origin storage, cookies, or DOM to steal. The parent fetches the
// self-contained octane runtime bundle (served by the playgroundRuntime()
// vite plugin) as text and hands it to the iframe, which builds blob modules
// on its own side of the boundary.
//
// Client-only: load via dynamic import from an effect (never during SSR).
import { compile } from 'octane/compiler';
import { sandboxSrcdoc, RUNTIME_MODULE_PATH, PROTOCOL_KEY } from './playground-sandbox.ts';

export type PlaygroundLang = 'tsrx' | 'tsx';

export interface CompileSuccess {
	ok: true;
	code: string;
}

export interface CompileFailure {
	ok: false;
	error: string;
}

/** Compile playground source for the client runtime. Never throws. */
export function compilePlayground(
	source: string,
	lang: PlaygroundLang,
): CompileSuccess | CompileFailure {
	try {
		const out = compile(source, `playground.${lang}`, { mode: 'client' });
		return { ok: true, code: out.code };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

// ── Sandboxed execution ─────────────────────────────────────────────────────

export interface Preview {
	/** Execute compiled playground code and render its component. Never throws. */
	run(code: string): Promise<{ error: string | null }>;
	destroy(): void;
}

/**
 * A live preview bound to `container` — creates the sandboxed iframe and
 * drives the postMessage protocol (see playground-sandbox.ts for the boundary
 * design). `onRuntimeError` reports errors thrown AFTER the initial render
 * resolves (effects, event handlers — caught by the ErrorBoundary the sandbox
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

	let destroyed = false;
	let generation = 0;
	const pending = new Map<number, (r: { error: string | null }) => void>();
	const send = (msg: Record<string, unknown>) => {
		iframe.contentWindow?.postMessage({ [PROTOCOL_KEY]: true, ...msg }, '*');
	};

	// Resolves once the sandbox has imported the runtime bundle; resolves with
	// an error string when it can't (fetch failed, srcdoc scripts unsupported —
	// e.g. jsdom — so run() reports instead of hanging).
	let cleanupListener: (() => void) | undefined;
	const ready = new Promise<string | null>((resolve) => {
		const fail = (message: string) => resolve(message);
		const bootTimeout = win.setTimeout(
			() => fail('Preview sandbox failed to boot (iframe scripts unavailable?).'),
			10_000,
		);
		const onMessage = (event: MessageEvent) => {
			if (destroyed || event.source !== iframe.contentWindow) return;
			const msg = event.data;
			if (!msg || msg[PROTOCOL_KEY] !== true) return;
			switch (msg.type) {
				case 'boot':
					// Sandbox is listening — hand it the runtime bundle as text (it
					// cannot fetch same-origin resources itself; see sandbox notes).
					fetch(RUNTIME_MODULE_PATH)
						.then((res) => {
							if (!res.ok) throw new Error(`${RUNTIME_MODULE_PATH} → HTTP ${res.status}`);
							return res.text();
						})
						.then((runtime) => send({ type: 'init', runtime }))
						.catch((error) =>
							fail(
								'Failed to load the preview runtime: ' +
									(error instanceof Error ? error.message : String(error)),
							),
						);
					break;
				case 'ready':
					win.clearTimeout(bootTimeout);
					resolve(typeof msg.error === 'string' ? msg.error : null);
					break;
				case 'result': {
					const resolvePending = pending.get(msg.gen);
					pending.delete(msg.gen);
					resolvePending?.({ error: typeof msg.error === 'string' ? msg.error : null });
					break;
				}
				case 'runtime-error':
					if (typeof msg.error === 'string') onRuntimeError(msg.error);
					break;
			}
		};
		win.addEventListener('message', onMessage);
		cleanupListener = () => {
			win.clearTimeout(bootTimeout);
			win.removeEventListener('message', onMessage);
		};
	});

	return {
		async run(code) {
			const gen = ++generation;
			const readyError = await ready;
			if (destroyed || gen !== generation) return { error: null }; // superseded
			if (readyError) return { error: readyError };

			// A newer run supersedes any still-pending one — resolve it quietly so
			// the caller's error handling never fires for stale results.
			for (const [staleGen, resolveStale] of pending) {
				pending.delete(staleGen);
				resolveStale({ error: null });
			}
			return new Promise((resolve) => {
				pending.set(gen, resolve);
				send({ type: 'run', code, gen });
			});
		},
		destroy() {
			destroyed = true;
			cleanupListener?.();
			for (const [, resolveStale] of pending) resolveStale({ error: null });
			pending.clear();
			iframe.remove();
		},
	};
}

// ── Default sources ─────────────────────────────────────────────────────────

export const DEFAULT_SOURCES: Record<PlaygroundLang, string> = {
	tsrx: `import { useState } from 'octane';

export default function App() @{
	const [count, setCount] = useState(0);
	const [items, setItems] = useState<string[]>([]);

	<div class="demo">
		<h2>{'Count: ' + count}</h2>
		<button onClick={() => setCount(count + 1)}>Increment</button>
		<button onClick={() => setItems([...items, 'Item #' + (items.length + 1)])}>
			Add item
		</button>
		@if (count >= 5) {
			<p class="hot">Count is heating up!</p>
		}
		<ul>
			@for (const item of items; key item) {
				<li>{item}</li>
			} @empty {
				<li class="empty">No items yet — add one.</li>
			}
		</ul>
		<style>
			.demo {
				font-family: system-ui, sans-serif;
				display: grid;
				gap: 0.5rem;
				justify-items: start;
			}
			button {
				padding: 0.4rem 0.9rem;
				border-radius: 8px;
				border: 1px solid #8886;
				background: transparent;
				color: inherit;
				cursor: pointer;
			}
			.hot {
				color: #ff5d72;
			}
			.empty {
				opacity: 0.6;
			}
		</style>
	</div>
}
`,
	tsx: `import { useState } from 'octane';

export default function App() {
	const [count, setCount] = useState(0);
	const [items, setItems] = useState<string[]>([]);

	return (
		<div style={{ fontFamily: 'system-ui, sans-serif' }}>
			<h2>{'Count: ' + count}</h2>
			<button onClick={() => setCount(count + 1)}>Increment</button>
			<button onClick={() => setItems([...items, 'Item #' + (items.length + 1)])}>
				Add item
			</button>
			{count >= 5 ? <p style={{ color: '#ff5d72' }}>Count is heating up!</p> : null}
			<ul>
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}
`,
};
