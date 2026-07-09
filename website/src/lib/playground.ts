// Playground engine — compiles TSRX/TSX in the browser with the REAL
// `octane/compiler` (it's pure JS: @tsrx/core parser + esrap printer, no Node
// APIs) and executes the compiled module for the live preview.
//
// Execution model: the compiled code's `import … from 'octane'` is rewritten to
// a blob-URL "provider" module that re-exports the site's own bundled octane
// runtime (exposed via a global — a blob can't import a bundled module by
// name), then the user module itself is imported as a blob URL and its exported
// component is rendered into the preview container with `createRoot`.
//
// Client-only: load via dynamic import from an effect (never during SSR).
import { compile } from 'octane/compiler';
import type { Root } from 'octane';

// The CLIENT runtime, loaded lazily. A static `import * as … from 'octane'`
// would resolve to `octane/server` in the SSR module graph (vite.config.ts
// aliases it) and trip rollup's missing-export analysis for `createRoot` —
// this module never RUNS on the server, but it is bundled there. The dynamic
// form keeps both graphs happy and still lands on the same client instance.
type OctaneRuntime = typeof import('octane');

let octanePromise: Promise<OctaneRuntime> | null = null;
function getOctane(): Promise<OctaneRuntime> {
	return (octanePromise ??= import('octane'));
}

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

// ── Module execution ────────────────────────────────────────────────────────

let providerUrl: string | null = null;

// A blob module re-exporting every octane runtime export from a global. Built
// once — the export list is static for the life of the bundle.
function getRuntimeProviderUrl(octane: OctaneRuntime): string {
	if (!providerUrl) {
		(globalThis as any).__OCTANE_PLAYGROUND_RUNTIME__ = octane;
		const source =
			'const m = globalThis.__OCTANE_PLAYGROUND_RUNTIME__;\n' +
			Object.keys(octane)
				.map((name) => `export const ${name} = m.${name};`)
				.join('\n');
		providerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
	}
	return providerUrl;
}

// Vite appends `?import` to variable dynamic imports, which corrupts blob:
// URLs — hide the import from the transform. (import() of a template string is
// rewritten even in plain .ts modules.)
const importModule: (url: string) => Promise<any> = new Function('u', 'return import(u);') as (
	url: string,
) => Promise<any>;

function findComponent(mod: Record<string, unknown>): ((...args: any[]) => unknown) | null {
	if (typeof mod.default === 'function') return mod.default as any;
	if (typeof mod.App === 'function') return mod.App as any;
	for (const key of Object.keys(mod)) {
		if (typeof mod[key] === 'function') return mod[key] as any;
	}
	return null;
}

export interface Preview {
	/** Execute compiled playground code and render its component. Never throws. */
	run(code: string): Promise<{ error: string | null }>;
	destroy(): void;
}

/**
 * A live preview bound to `container`. `onRuntimeError` reports errors thrown
 * AFTER the initial render resolves (effects, event handlers — caught by the
 * ErrorBoundary the preview wraps around the user component).
 */
export function createPreview(
	container: Element,
	onRuntimeError: (message: string) => void,
): Preview {
	let root: Root | null = null;
	let generation = 0;

	const teardown = () => {
		try {
			root?.unmount();
		} catch {
			// A broken user component may throw during cleanup — never let that
			// wedge the playground.
		}
		root = null;
		container.innerHTML = '';
	};

	return {
		async run(code) {
			const gen = ++generation;
			const octane = await getOctane();

			// The provider handles 'octane'; any other bare specifier can't resolve
			// inside a blob module — fail with a clear message instead of a cryptic
			// network error from the import.
			const rewritten = code.replace(
				/(\bfrom\s*)(['"])octane\2/g,
				(_m, from, _q) => `${from}${JSON.stringify(getRuntimeProviderUrl(octane))}`,
			);
			const leftover = rewritten
				.match(/\bfrom\s*['"]([^'"]+)['"]/g)
				?.find((clause) => !clause.includes('blob:'));
			if (leftover) {
				return { error: `Only imports from 'octane' are supported in the playground.` };
			}

			let moduleUrl: string;
			try {
				moduleUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }));
			} catch (error) {
				// e.g. an environment without createObjectURL (jsdom) — report, never throw.
				return { error: error instanceof Error ? error.message : String(error) };
			}
			let mod: Record<string, unknown>;
			try {
				mod = await importModule(moduleUrl);
			} catch (error) {
				return { error: error instanceof Error ? error.message : String(error) };
			} finally {
				URL.revokeObjectURL(moduleUrl);
			}
			if (gen !== generation) return { error: null }; // superseded by a newer run

			const component = findComponent(mod);
			if (!component) {
				return {
					error: 'Export a component to render — e.g. `export default function App() @{ … }`.',
				};
			}

			teardown();
			root = octane.createRoot(container);
			try {
				root.render(
					octane.createElement(
						octane.ErrorBoundary,
						{
							fallback: (error: unknown) => {
								onRuntimeError(error instanceof Error ? error.message : String(error));
								return null;
							},
							// createElement's extra-children form fills this in at runtime.
						} as any,
						octane.createElement(component as any),
					),
				);
			} catch (error) {
				teardown();
				return { error: error instanceof Error ? error.message : String(error) };
			}
			return { error: null };
		},
		destroy: teardown,
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
