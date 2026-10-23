import { createRoot, flushSync } from 'octane';
import { ClientApp, RawHtml } from './app.tsrx';

declare const trustedTypes: any;

const policy = trustedTypes.createPolicy('app', {
	createHTML: (s: string) => s,
	createScriptURL: (s: string) => s,
});

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
