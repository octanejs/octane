// The playground preview's SECURITY BOUNDARY. User code from the editor (and,
// critically, from shareable `location.hash` payloads) executes inside an
// `<iframe sandbox="allow-scripts allow-forms">` built from this srcdoc — an
// OPAQUE origin with no access to the website's window, DOM, cookies, or
// storage, plus a CSP that blocks all network use (`default-src 'none'`) so a
// payload cannot exfiltrate or fetch either. The parent page never imports
// user modules itself.
//
// Module plumbing: an opaque-origin iframe cannot use the parent's blob: URLs
// (blob resolution is same-origin) and cross-origin module fetches would need
// CORS, so everything arrives as TEXT over postMessage and becomes blob
// modules INSIDE the iframe:
//
//   parent → iframe  { type: 'init', runtime }   octane runtime source, once
//                                                (the self-contained bundle
//                                                served at RUNTIME_MODULE_PATH
//                                                by the vite plugin)
//   parent → iframe  { type: 'run', code, gen }  compiled user module
//   iframe → parent  { type: 'boot' }            bootstrap script is listening
//   iframe → parent  { type: 'ready', error? }   runtime imported (or failed)
//   iframe → parent  { type: 'result', gen, error }
//   iframe → parent  { type: 'runtime-error', error }  post-render, from the
//                                                ErrorBoundary around the app
//
// Every message carries `__octanePlayground: true` and both sides verify
// `event.source` identity, so unrelated frames can't speak the protocol.
// `allow-forms` (+ CSP `form-action 'none'`) lets `<form action={fn}>` demos
// fire submit events without permitting a real submission/navigation.

/** Where the self-contained octane client runtime bundle is served/emitted. */
export const RUNTIME_MODULE_PATH = '/playground-runtime.mjs';

/** Marker every protocol message carries (both directions). */
export const PROTOCOL_KEY = '__octanePlayground';

// Kept as a plain string (not a function that's stringified) so esbuild/terser
// renaming can't corrupt it, and indented for readability in devtools.
const BOOTSTRAP = `
const KEY = ${JSON.stringify(PROTOCOL_KEY)};
const post = (msg) => window.parent.postMessage({ [KEY]: true, ...msg }, '*');
const errText = (e) => (e instanceof Error && e.message) || String(e);

let octane = null;
let runtimeUrl = null;
let root = null;
let generation = 0;

const teardown = () => {
	try {
		root?.unmount();
	} catch {}
	root = null;
	document.getElementById('root').innerHTML = '';
};

const findComponent = (mod) => {
	if (typeof mod.default === 'function') return mod.default;
	if (typeof mod.App === 'function') return mod.App;
	for (const key of Object.keys(mod)) {
		if (typeof mod[key] === 'function') return mod[key];
	}
	return null;
};

window.addEventListener('message', async (event) => {
	if (event.source !== window.parent) return;
	const msg = event.data;
	if (!msg || msg[KEY] !== true) return;

	if (msg.type === 'init' && !runtimeUrl && typeof msg.runtime === 'string') {
		try {
			runtimeUrl = URL.createObjectURL(new Blob([msg.runtime], { type: 'text/javascript' }));
			octane = await import(runtimeUrl);
			post({ type: 'ready' });
		} catch (e) {
			post({ type: 'ready', error: errText(e) });
		}
		return;
	}

	if (msg.type === 'run' && octane && typeof msg.code === 'string') {
		const gen = ++generation;
		const rewritten = msg.code.replace(
			/(\\bfrom\\s*)(['"])octane\\2/g,
			(_m, from) => from + JSON.stringify(runtimeUrl),
		);
		const leftover = (rewritten.match(/\\bfrom\\s*['"]([^'"]+)['"]/g) || []).find(
			(clause) => !clause.includes('blob:'),
		);
		if (leftover) {
			post({
				type: 'result',
				gen: msg.gen,
				error: "Only imports from 'octane' are supported in the playground.",
			});
			return;
		}
		const url = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }));
		let mod;
		try {
			mod = await import(url);
		} catch (e) {
			post({ type: 'result', gen: msg.gen, error: errText(e) });
			return;
		} finally {
			URL.revokeObjectURL(url);
		}
		if (gen !== generation) return; // superseded by a newer run

		const component = findComponent(mod);
		if (!component) {
			post({
				type: 'result',
				gen: msg.gen,
				error: 'Export a component to render — e.g. \`export default function App() @{ … }\`.',
			});
			return;
		}
		teardown();
		root = octane.createRoot(document.getElementById('root'));
		try {
			root.render(
				octane.createElement(
					octane.ErrorBoundary,
					{
						fallback: (error) => {
							post({ type: 'runtime-error', error: errText(error) });
							return null;
						},
					},
					octane.createElement(component),
				),
			);
		} catch (e) {
			teardown();
			post({ type: 'result', gen: msg.gen, error: errText(e) });
			return;
		}
		post({ type: 'result', gen: msg.gen, error: null });
	}
});

post({ type: 'boot' });
`;

/**
 * The full srcdoc for the preview iframe. The CSP allows exactly what the
 * bootstrap needs — inline module + blob modules + inline styles (octane's
 * `injectStyle` writes `<style>` tags) — and nothing else: no network of any
 * kind, no form submission, no plugins.
 */
export function sandboxSrcdoc(): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'">
<style>
	:root { color-scheme: dark; }
	body {
		margin: 0;
		padding: 1.25rem;
		background: #16181d;
		color: #f4eee8;
		font-family: system-ui, sans-serif;
	}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">${BOOTSTRAP}</script>
</body>
</html>`;
}
