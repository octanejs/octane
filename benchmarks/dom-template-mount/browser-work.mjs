// Browser semantic gate for native custom-element connection and document
// adoption. The bundle comes from run.mjs's BENCH_BUNDLE_PATH output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(
	process.env.OCTANE_DOM_DEPS_ROOT || path.join(import.meta.dirname, '../..'),
);
const requireDeps = createRequire(path.join(ROOT, 'packages/octane/package.json'));
const { chromium } = requireDeps('playwright');
const bundleFile = process.argv[2];
assert.ok(bundleFile, 'pass the production bundle written with BENCH_BUNDLE_PATH');
const bundle = fs.readFileSync(bundleFile, 'utf8');
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	const facts = await page.evaluate(async (source) => {
		const blob = new Blob([source], { type: 'text/javascript' });
		const url = URL.createObjectURL(blob);
		const runtime = await import(url);
		URL.revokeObjectURL(url);
		const callbacks = [];
		customElements.define(
			'octane-probe',
			class extends HTMLElement {
				constructor() {
					super();
					callbacks.push({
						phase: 'construct',
						visible: this.childNodes.length,
						text: this.textContent,
					});
					if (this.getAttribute('data-name') === 'text') {
						this.insertBefore(document.createTextNode('owned:'), this.firstChild);
					}
				}
				connectedCallback() {
					callbacks.push({
						phase: 'connect',
						name: this.getAttribute('data-name'),
						text: this.textContent,
						visible: [...this.parentElement.querySelectorAll('octane-probe')].map((node) =>
							node.getAttribute('data-name'),
						),
					});
				}
			},
		);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = runtime.createRoot(container);
		root.render(runtime.CustomRoots);
		const names = [...container.querySelectorAll('octane-probe')].map((node) =>
			node.getAttribute('data-name'),
		);
		const connected = callbacks.splice(0);
		root.unmount();
		container.remove();
		const textHost = document.createElement('div');
		document.body.appendChild(textHost);
		const textRoot = runtime.createRoot(textHost);
		textRoot.render(runtime.CustomTextRoot, { label: 'dynamic' });
		const customNode = textHost.querySelector('octane-probe');
		const ownedText = customNode?.firstChild;
		const authoredText = customNode?.lastChild;
		runtime.flushSync(() => textRoot.render(runtime.CustomTextRoot, { label: 'updated' }));
		const customText = {
			text: customNode?.textContent,
			children: customNode?.childNodes.length,
			owned: customNode?.firstChild === ownedText && ownedText?.nodeValue === 'owned:',
			authored: customNode?.lastChild === authoredText && authoredText?.nodeValue === 'updated',
			callbacks: callbacks.splice(0),
		};
		textRoot.unmount();
		textHost.remove();

		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		const foreign = iframe.contentDocument;
		const foreignHost = foreign.createElement('div');
		foreign.body.appendChild(foreignHost);
		const foreignRoot = runtime.createRoot(foreignHost);
		foreignRoot.render(runtime.RootTextPair, { label: 'other' });
		const adopted = [...foreignHost.querySelectorAll('#first, #last')].map((node) => ({
			text: node.textContent,
			owner: node.ownerDocument === foreign,
		}));
		foreignRoot.unmount();
		iframe.remove();

		const server = document.createElement('div');
		server.innerHTML = '<strong id="first">Hydrated</strong><em id="last">tail</em>';
		document.body.appendChild(server);
		const first = server.querySelector('#first');
		const last = server.querySelector('#last');
		const text = first.firstChild;
		const hydrated = runtime.hydrateRoot(server, runtime.RootTextPair, { label: 'Hydrated' });
		runtime.flushSync(() => {});
		const retained =
			server.querySelector('#first') === first &&
			server.querySelector('#last') === last &&
			first.firstChild === text;
		runtime.flushSync(() => hydrated.render(runtime.RootTextPair, { label: '' }));
		const updated =
			first.textContent === '' &&
			first.firstChild === text &&
			first.firstChild.nodeType === 3 &&
			server.querySelector('#last') === last;
		hydrated.unmount();
		server.remove();
		return { names, connected, customText, adopted, retained, updated };
	}, bundle);
	assert.deepEqual(facts.names, ['a', 'b']);
	assert.deepEqual(facts.connected, [
		{ phase: 'construct', visible: 1, text: 'A' },
		{ phase: 'connect', name: 'a', text: 'A', visible: ['a'] },
		{ phase: 'construct', visible: 1, text: 'B' },
		{ phase: 'connect', name: 'b', text: 'B', visible: ['a', 'b'] },
	]);
	assert.deepEqual(facts.customText, {
		text: 'owned:updated',
		children: 2,
		owned: true,
		authored: true,
		callbacks: [
			{ phase: 'construct', visible: 1, text: 'dynamic' },
			{ phase: 'connect', name: 'text', text: 'owned:dynamic', visible: ['text'] },
		],
	});
	assert.deepEqual(facts.adopted, [
		{ text: 'other', owner: true },
		{ text: 'tail', owner: true },
	]);
	assert.equal(facts.retained, true, 'hydrate adopts both roots and text');
	assert.equal(facts.updated, true, 'first update retains adopted text and trailing root');
	console.log(`PASS dom-template-mount/browser: ${JSON.stringify(facts)}`);
} finally {
	await browser.close();
}
