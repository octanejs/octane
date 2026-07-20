// The playground preview's SECURITY BOUNDARY. User code from the editor (and,
// critically, from shareable `location.hash` payloads) executes inside an
// `<iframe sandbox="allow-scripts allow-forms">` built from this srcdoc — an
// OPAQUE origin with no access to the website's window, DOM, cookies, or
// storage. The CSP blocks all network use EXCEPT module loads from esm.sh
// (`script-src … https://esm.sh`) — a deliberate, documented relaxation that
// powers third-party imports (`import { createStore } from 'zustand/vanilla'`
// → rewritten to an esm.sh URL by playground-modules.ts). Everything else
// stays blocked: no fetch/XHR (`default-src 'none'` covers `connect-src`), no
// form submission, no navigation targets. The consent gate for hash-shared
// links is unchanged, and compilation is pure string work in the parent, so no
// esm.sh traffic can happen before the user consents to running shared code.
// The parent page never imports user modules itself.
//
// Module plumbing: an opaque-origin iframe cannot use the parent's blob: URLs
// (blob resolution is same-origin) and cross-origin module fetches would need
// CORS, so the runtime and user modules arrive as TEXT over postMessage and
// become blob modules INSIDE the iframe:
//
//   parent → iframe  { type: 'init', manifest }  octane runtime chunk manifest
//                                                (the entries/order/files JSON
//                                                the vite plugin serves at
//                                                RUNTIME_MANIFEST_PATH), once
//   parent → iframe  { type: 'run', gen, entry, entryKind, modules }
//                                                compiled user module graph in
//                                                dependency order
//   iframe → parent  { type: 'boot' }            bootstrap script is listening
//   iframe → parent  { type: 'ready', error? }   runtime imported (or failed)
//   iframe → parent  { type: 'result', gen, error }
//   iframe → parent  { type: 'runtime-error', gen, error }  post-render, from
//                                                the error boundary around the
//                                                app; gen lets the parent drop
//                                                late errors from a superseded
//                                                run
//
// Import resolution inside the iframe: the bootstrap blob-ifies the runtime
// chunks dependencies-first, then installs a SINGLE import map — as a classic
// (non-module) script it runs before any module load, which is baseline
// import-map behavior in every supporting browser; no late-map mutation
// anywhere — wiring bare `octane` / `octane/react` to those blobs and the
// react family to esm.sh (react is only fetched if something imports it).
// User modules keep those specifiers bare; sibling-file imports arrive as
// `__pg_module:<name>__` tokens the bootstrap swaps for blob URLs.
//
// Every message carries `__octanePlayground: true` and both sides verify
// `event.source` identity, so unrelated frames can't speak the protocol.
// `allow-forms` (+ CSP `form-action 'none'`) lets `<form action={fn}>` demos
// fire submit events without permitting a real submission/navigation.

/** Where the runtime chunk manifest JSON is served/emitted. */
export const RUNTIME_MANIFEST_PATH = '/playground-runtime.json';

/** Marker every protocol message carries (both directions). */
export const PROTOCOL_KEY = '__octanePlayground';

/**
 * React version pinned into the sandbox import map. Keep aligned with the
 * workspace catalog's `react: ^19.2.0` pin — every map entry uses the SAME
 * version so esm.sh dedupes react/react-dom onto one internal build (the
 * OctaneCompat host and user code must share a react singleton).
 */
export const PLAYGROUND_REACT_VERSION = '19.2.0';

/** Shape of the runtime manifest built by the playgroundRuntime() vite plugin. */
export interface RuntimeManifest {
	entries: { octane: string; 'octane/react': string };
	order: string[];
	files: Record<string, string>;
}

/** Wraps a sibling-file module name into its rewritten-specifier token. */
export function moduleToken(name: string): string {
	return `__pg_module:${name}__`;
}

// Kept as a plain string (not a function that's stringified) so esbuild/terser
// renaming can't corrupt it, and indented for readability in devtools. This is
// a CLASSIC script (dynamic import() only) so the import map it writes is
// guaranteed to precede the first module load.
const BOOTSTRAP = `
const KEY = ${JSON.stringify(PROTOCOL_KEY)};
const REACT_VERSION = ${JSON.stringify(PLAYGROUND_REACT_VERSION)};
const TOKEN = /__pg_module:([\\w.-]+)__/g;
const post = (msg) => window.parent.postMessage({ [KEY]: true, ...msg }, '*');
const errText = (e) => (e instanceof Error && e.message) || String(e);
const toBlobUrl = (code) =>
	URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));

let octane = null;
let root = null; // { kind: 'octane' | 'react', unmount() }
let generation = 0;
let liveUrls = []; // current run's module blob URLs — kept alive so lazy
                   // dynamic import('./sibling') still resolves after render

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

	if (msg.type === 'init' && !octane && msg.manifest) {
		try {
			const { entries, order, files } = msg.manifest;
			// Blob-ify the runtime chunks dependencies-first, splicing each file's
			// "./name.mjs" specifiers to the already-created blob URLs.
			const blobs = Object.create(null);
			for (const name of order) {
				const code = files[name].replace(/(["'])\\.\\/([\\w.-]+\\.mjs)\\1/g, (m, _q, dep) =>
					blobs[dep] ? JSON.stringify(blobs[dep]) : m,
				);
				blobs[name] = toBlobUrl(code);
			}
			// Install the import map BEFORE the first module load (see header).
			const esm = (path) => 'https://esm.sh/' + path;
			const map = document.createElement('script');
			map.type = 'importmap';
			map.textContent = JSON.stringify({
				imports: {
					octane: blobs[entries['octane']],
					'octane/react': blobs[entries['octane/react']],
					react: esm('react@' + REACT_VERSION),
					'react/jsx-runtime': esm('react@' + REACT_VERSION + '/jsx-runtime'),
					'react/jsx-dev-runtime': esm('react@' + REACT_VERSION + '/jsx-dev-runtime'),
					'react-dom': esm('react-dom@' + REACT_VERSION),
					'react-dom/client': esm('react-dom@' + REACT_VERSION + '/client'),
				},
			});
			document.head.appendChild(map);
			octane = await import('octane');
			post({ type: 'ready' });
		} catch (e) {
			post({ type: 'ready', error: errText(e) });
		}
		return;
	}

	if (msg.type === 'run' && octane && Array.isArray(msg.modules)) {
		const gen = ++generation;
		// Blob-ify the user module graph (arrives dependencies-first), swapping
		// sibling-file tokens for the blob URLs created so far.
		// The PREVIOUS run's URLs can be revoked now; this run's stay alive.
		for (const url of liveUrls) URL.revokeObjectURL(url);
		const moduleUrls = Object.create(null);
		const created = [];
		liveUrls = created;
		let entryUrl = null;
		for (const { name, code } of msg.modules) {
			const resolved = code.replace(TOKEN, (m, dep) => moduleUrls[dep] ?? m);
			const url = toBlobUrl(resolved);
			moduleUrls[name] = url;
			created.push(url);
			if (name === msg.entry) entryUrl = url;
		}
		let mod;
		try {
			mod = await import(entryUrl);
		} catch (e) {
			let error = errText(e);
			if (msg.modules.some(({ code }) => code.includes('https://esm.sh/'))) {
				error =
					'Failed to load the module graph — if the error below points at an ' +
					'esm.sh module, the package/version may not exist or the network ' +
					'may be unreachable: ' + error;
			}
			post({ type: 'result', gen: msg.gen, error });
			return;
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
		const rootEl = document.getElementById('root');
		try {
			if (msg.entryKind === 'react') {
				// React-host entry (OctaneCompat demos): mount with the REAL
				// react-dom from esm.sh. Errors that escape the host tree surface
				// like the octane path's error boundary does.
				const [React, ReactDOMClient] = await Promise.all([
					import('react'),
					import('react-dom/client'),
				]);
				if (gen !== generation) return;
				const reactRoot = ReactDOMClient.createRoot(rootEl, {
					onUncaughtError: (error) =>
						post({ type: 'runtime-error', gen: msg.gen, error: errText(error) }),
					onCaughtError: (error) =>
						post({ type: 'runtime-error', gen: msg.gen, error: errText(error) }),
				});
				root = { kind: 'react', unmount: () => reactRoot.unmount() };
				reactRoot.render(React.createElement(component));
			} else {
				const octaneRoot = octane.createRoot(rootEl);
				root = { kind: 'octane', unmount: () => octaneRoot.unmount() };
				octaneRoot.render(
					octane.createElement(
						octane.ErrorBoundary,
						{
							fallback: (error) => {
								post({ type: 'runtime-error', gen: msg.gen, error: errText(error) });
								return null;
							},
						},
						octane.createElement(component),
					),
				);
			}
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
 * bootstrap needs — inline classic script + import map + blob modules + module
 * loads from esm.sh + inline styles (octane's `injectStyle` writes `<style>`
 * tags) — and nothing else: no fetch/XHR, no form submission, no plugins.
 */
export function sandboxSrcdoc(): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob: https://esm.sh; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'">
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
<script>${BOOTSTRAP}</script>
</body>
</html>`;
}
