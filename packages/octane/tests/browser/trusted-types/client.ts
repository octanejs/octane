import { createRoot, flushSync, hydrateRoot } from 'octane';
import {
	ClientApp,
	DeferredPage,
	HydratedPage,
	PAGE_HTML,
	RawHtml,
	StreamedPage,
} from './app.tsrx';

declare const trustedTypes: any;

const policy = trustedTypes.createPolicy('app', {
	createHTML: (s: string) => s,
	createScriptURL: (s: string) => s,
});

function clientRender() {
	const root = createRoot(document.getElementById('client-root')!);
	flushSync(() =>
		root.render(ClientApp, {
			html: policy.createHTML('<i id="inner">one</i>'),
			doc: policy.createHTML('<p>doc</p>'),
			src: policy.createScriptURL('/one.js'),
		}),
	);
	flushSync(() =>
		root.render(ClientApp, {
			html: policy.createHTML('<i id="inner">two</i>'),
			doc: policy.createHTML('<p>doc two</p>'),
			src: policy.createScriptURL('/two.js'),
		}),
	);

	// Enforcement is live: an application string still reaches the sink as a
	// string, so the browser rejects it rather than Octane's policy accepting it.
	let rejected: string | null = null;
	const raw = createRoot(document.getElementById('raw-root')!);
	try {
		flushSync(() => raw.render(RawHtml, { html: '<i>raw</i>' }));
	} catch (error) {
		rejected = String(error);
	}

	(window as any).__trustedTypes = {
		inner: document.getElementById('inner')?.textContent ?? null,
		staticText: document.getElementById('static')?.textContent ?? null,
		srcdoc: document.getElementById('frame')?.getAttribute('srcdoc') ?? null,
		src: document.getElementById('src')?.getAttribute('src') ?? null,
		rawMounted: document.getElementById('raw') !== null,
		rejected,
	};
}

/**
 * Hydrates the server page at `#root`, recording effects, recoverable errors,
 * and whether the server's elements outside the fallbacks were adopted.
 */
function hydrate(page: string) {
	const ready: string[] = [];
	const recoverable: string[] = [];
	const server = Array.from(document.querySelectorAll('#root [id]')).filter(
		(el) => !el.id.endsWith('-fallback'),
	);
	const props = {
		html: policy.createHTML(PAGE_HTML),
		ready: (name: string) => ready.push(name),
		rows: Promise.resolve('streamed row'),
		shapes: Promise.resolve('streamed shape'),
	};
	const body = page === 'stream' ? StreamedPage : page === 'deferred' ? DeferredPage : HydratedPage;
	hydrateRoot(document.getElementById('root')!, body, props, {
		onRecoverableError: (error: unknown) => recoverable.push(String(error)),
	});
	(window as any).__trustedTypes = {
		ready,
		recoverable,
		get adopted() {
			return server.every((el) => el.isConnected && document.getElementById(el.id) === el);
		},
	};
}

const page = location.pathname.slice(1);
if (page === '') clientRender();
else hydrate(page);
