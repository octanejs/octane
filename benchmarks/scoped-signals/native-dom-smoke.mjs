// Supplemental source-level DOM/SSR ABI checks. These use the real runtime and
// signal engine, but hand-written compiler fences: they do not validate .tsrx
// compilation, published import conditions, production cost, or retained heaps.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
};
const toolingRoot = path.resolve(option('--tooling-root') ?? root);
const output = option('--output');
if (!output) throw new Error('Pass --output <report.json>; --tooling-root is optional.');
const tooling = createRequire(path.join(toolingRoot, 'package.json'));
const esbuild = tooling('esbuild');
const { JSDOM } = tooling('jsdom');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-native-dom-'));
const bundlePath = path.join(scratch, 'runtime.cjs');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const startedAt = new Date().toISOString();

function packageVersion(specifier) {
	let directory = path.dirname(tooling.resolve(specifier));
	while (!fs.existsSync(path.join(directory, 'package.json'))) {
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error('Missing package metadata for ' + specifier);
		directory = parent;
	}
	return JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version;
}
assert.equal(packageVersion('alien-signals/system'), '3.2.0');

async function main() {
	const bundle = await esbuild.build({
		stdin: {
			contents:
				'export * as client from "./packages/octane/src/runtime.ts"; export * as server from "./packages/octane/src/runtime.server.ts"; export * as signals from "./packages/octane/src/signals/index.ts"; export * as hooks from "./packages/octane/src/signals/client.ts"; export * as serverHooks from "./packages/octane/src/signals/server.ts"; export * as hydration from "./packages/octane/src/hydration/index.ts";',
			resolveDir: root,
			loader: 'ts',
		},
		outfile: bundlePath,
		bundle: true,
		metafile: true,
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		nodePaths: [path.join(toolingRoot, 'node_modules')],
		define: { 'process.env.NODE_ENV': '"development"' },
		logLevel: 'warning',
	});
	const sourceInputs = Object.keys(bundle.metafile.inputs)
		.filter((input) => input !== '<stdin>')
		.sort()
		.map((input) => {
			const absolutePath = path.isAbsolute(input) ? input : path.resolve(root, input);
			return { path: input, absolutePath, sha256: hash(fs.readFileSync(absolutePath)) };
		});
	const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
		pretendToBeVisual: true,
		runScripts: 'outside-only',
		url: 'http://localhost/',
	});
	for (const key of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'Comment',
		'Text',
		'DocumentFragment',
		'HTMLTemplateElement',
		'Event',
		'MouseEvent',
		'KeyboardEvent',
		'FocusEvent',
		'InputEvent',
		'MutationObserver',
		'HTMLInputElement',
		'HTMLSelectElement',
		'HTMLTextAreaElement',
		'SVGElement',
	]) {
		if (key in dom.window) global[key] = dom.window[key];
	}
	global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
	global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
	global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
	const {
		client: C,
		server: S,
		signals: G,
		hooks: H,
		serverHooks: SH,
		hydration: HY,
	} = tooling(bundlePath);
	const element = C.createElement;
	const native = (fn) => (props, scope) => {
		const token = C.beginNativeReadScope(scope, 1);
		let completed = false;
		try {
			const result = fn(props, scope);
			completed = true;
			return result;
		} finally {
			C.endNativeReadScope(token, completed);
		}
	};
	const serverNative = (fn) => (props, scope) => {
		const token = S.beginNativeReadScope(scope, 1);
		let completed = false;
		try {
			const result = fn(props, scope);
			completed = true;
			return result;
		} finally {
			S.endNativeReadScope(token, completed);
		}
	};
	const container = () => {
		const c = document.createElement('div');
		document.body.append(c);
		return c;
	};
	const settle = () => C.act(() => {});
	const tests = [];
	const test = (name, fn) => tests.push({ name, fn });

	test('native subscriptions replace DOM values and survive sibling root unmount', () => {
		const scope = G.createScope({ scopeKey: 'dom-direct' });
		const count = scope.signal$('count', 1);
		const App = native(() => element('output', null, String(scope.get(count))));
		const a = container(),
			b = container();
		const ra = C.createRoot(a),
			rb = C.createRoot(b);
		C.flushSync(() => {
			ra.render(App);
			rb.render(App);
		});
		const host = b.querySelector('output');
		C.flushSync(() => scope.set(count, 7));
		assert.equal(a.textContent, '7');
		assert.equal(b.textContent, '7');
		assert.equal(b.querySelector('output'), host);
		ra.unmount();
		C.flushSync(() => scope.set(count, 8));
		assert.equal(b.textContent, '8');
		assert.equal(a.textContent, '');
		rb.unmount();
		scope.dispose();
		a.remove();
		b.remove();
	});

	test('capture and bubble share one signal graph batch', () => {
		const scope = G.createScope({ scopeKey: 'dom-event' });
		const a = scope.signal$('a', 0),
			b = scope.signal$('b', 0);
		const sum = scope.derived$('sum', () => scope.get(a) + scope.get(b));
		const values = [];
		sum.subscribe(() => values.push(scope.get(sum)));
		scope.get(sum);
		const App = native(() =>
			element(
				'div',
				{ onClickCapture: () => scope.set(a, 1) },
				element('button', { onClick: () => scope.set(b, 1) }, 'go'),
			),
		);
		const c = container(),
			r = C.createRoot(c);
		C.flushSync(() => r.render(App));
		c.querySelector('button').click();
		assert.deepEqual(values, [2]);
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('hydration adopts historical ready data then reconciles live data after layout', () => {
		const scope = G.createScope({ scopeKey: 'dom-seed' });
		const count = scope.signal$('count', 1);
		const Server = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, String(scope.get(count))), s),
		);
		const rendered = S.renderToString(Server);
		assert.equal(rendered.signals.scopes[0].scopeKey, 'dom-seed');
		const c = container();
		c.innerHTML = rendered.html;
		const host = c.querySelector('output');
		scope.set(count, 9);
		const layout = [],
			slot = Symbol('layout');
		const App = native(() => {
			const value = scope.get(count);
			C.useLayoutEffect(
				() => {
					layout.push(value + ':' + c.querySelector('output').textContent + ':' + scope.get(count));
				},
				[value],
				slot,
			);
			return element('output', null, String(value));
		});
		let r, adopted;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
			adopted = c.textContent;
		});
		assert.equal(adopted, '1');
		assert.equal(c.querySelector('output'), host);
		assert.equal(c.textContent, '9');
		assert.deepEqual(layout, ['1:1:9', '9:9:9']);
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('missing native hydration channel recovers at root without application catch', () => {
		const scope = G.createScope({ scopeKey: 'dom-missing' });
		const a = scope.signal$('a', 'server'),
			b = scope.signal$('b', 'live');
		const Server = serverNative((p, s) => S.ssrChild(S.createElement('p', null, scope.get(a)), s));
		const c = container();
		c.innerHTML = S.renderToString(Server).html;
		let caught = 0,
			recovered = 0;
		const App = native(() => element('p', null, scope.get(b)));
		let r;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App, undefined, {
				onCaughtError: () => caught++,
				onRecoverableError: () => recovered++,
			});
		});
		assert.equal(c.textContent, 'live');
		assert.equal(caught, 0);
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('pending native server arm is mounted fresh without stealing a ready sibling frame', async () => {
		const scope = G.createScope({ scopeKey: 'dom-pending' });
		const count = scope.signal$('count', 'old');
		const key = scope.signal$('key', 'a');
		let resolveA;
		const pending = new Promise((resolve) => {
			resolveA = resolve;
		});
		const load = G.query('dom-pending-loader', (arg) =>
			arg === 'a' ? pending : Promise.resolve('ready-b'),
		);
		const resource = scope.asyncSignal$('resource', () => load(scope.get(key)));
		const ReadS = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, scope.get(resource)), s),
		);
		const SiblingS = serverNative((p, s) =>
			S.ssrChild(S.createElement('span', { class: 'sibling' }, scope.get(count)), s),
		);
		const Server = (p, s) =>
			S.ssrChild(
				S.createElement(
					'section',
					null,
					S.createElement(
						S.Suspense,
						{ fallback: S.createElement('i', null, 'waiting') },
						S.createElement(ReadS),
					),
					S.createElement(SiblingS),
				),
				s,
			);
		const rendered = S.renderToString(Server);
		assert.match(rendered.html, /oct-native-fresh:/);
		const c = container();
		c.innerHTML = rendered.html;
		const sibling = c.querySelector('.sibling');
		scope.set(count, 'new');
		scope.set(key, 'b');
		const Read = native(() => element('output', null, scope.get(resource)));
		const Sibling = native(() => element('span', { class: 'sibling' }, scope.get(count)));
		const App = () =>
			element(
				'section',
				null,
				element(C.Suspense, { fallback: element('i', null, 'waiting') }, element(Read)),
				element(Sibling),
			);
		let r;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
		});
		await settle();
		await settle();
		assert.equal(c.querySelector('output')?.textContent, 'ready-b');
		assert.equal(c.querySelector('.sibling'), sibling);
		assert.equal(sibling.textContent, 'new');
		r.unmount();
		scope.dispose();
		resolveA('late-a');
		c.remove();
	});

	test('SSR and adoption preserve retained latest while the strict value is pending', async () => {
		const scope = G.createScope({ scopeKey: 'dom-latest' });
		const key = scope.signal$('key', 'a');
		let finishB;
		const pendingB = new Promise((resolve) => {
			finishB = resolve;
		});
		const load = G.query('dom-latest-loader', (arg) =>
			arg === 'a' ? Promise.resolve('ready-a') : pendingB,
		);
		const resource = scope.asyncSignal$('resource', () => load(scope.get(key)));
		await settle();
		scope.set(key, 'b');
		const Server = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, resource.latest('empty')), s),
		);
		const rendered = S.renderToString(Server);
		const entry = rendered.signals.scopes[0].entries.find(
			(entry) => entry.key === 'resource' && entry.read === 'latest',
		);
		assert.equal(entry.request.argument[1], 'a');
		const c = container();
		c.innerHTML = rendered.html;
		const host = c.querySelector('output');
		finishB('ready-b');
		await settle();
		const App = native(() => element('output', null, resource.latest('empty')));
		let r, adopted;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
			adopted = c.textContent;
		});
		assert.equal(adopted, 'ready-a');
		assert.equal(c.textContent, 'ready-b');
		assert.equal(c.querySelector('output'), host);
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('latest with no retained value adopts its authored fallback', async () => {
		const scope = G.createScope({ scopeKey: 'dom-latest-empty' });
		let finish;
		const pending = new Promise((resolve) => {
			finish = resolve;
		});
		const load = G.query('dom-latest-empty-loader', () => pending);
		const resource = scope.asyncSignal$('resource', () => load(null));
		const Server = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, resource.latest('loading')), s),
		);
		const rendered = S.renderToString(Server);
		const entry = rendered.signals.scopes[0].entries.find((entry) => entry.key === 'resource');
		assert.equal(entry.read, 'latest');
		assert.equal(entry.available, false);
		const c = container();
		c.innerHTML = rendered.html;
		const host = c.querySelector('output');
		finish('ready');
		await settle();
		const App = native(() => element('output', null, resource.latest('loading')));
		let r, adopted;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
			adopted = c.textContent;
		});
		assert.equal(adopted, 'loading');
		assert.equal(c.textContent, 'ready');
		assert.equal(c.querySelector('output'), host);
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('SSR keeps strict and snapshot read channels distinct for the same node', () => {
		const scope = G.createScope({ scopeKey: 'dom-channels' });
		const count = scope.signal$('count', 1);
		const read = () => String(count.get()) + '/' + String(count.snapshot().value);
		const Server = serverNative((p, s) => S.ssrChild(S.createElement('output', null, read()), s));
		const rendered = S.renderToString(Server);
		assert.deepEqual(
			rendered.signals.scopes[0].entries.map((entry) => entry.read ?? 'value').sort(),
			['snapshot', 'value'],
		);
		const c = container();
		c.innerHTML = rendered.html;
		scope.set(count, 2);
		const App = native(() => element('output', null, read()));
		let r, adopted;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
			adopted = c.textContent;
		});
		assert.equal(adopted, '1/1');
		assert.equal(c.textContent, '2/2');
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('SSR rejects equal seeds from distinct scopes with the same scope key', () => {
		const first = G.createScope({ scopeKey: 'dom-duplicate-owner' }),
			second = G.createScope({ scopeKey: 'dom-duplicate-owner' });
		const a = first.signal$('value', 'equal'),
			b = second.signal$('value', 'equal');
		const Child = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, p.scope.get(p.value)), s),
		);
		const Server = serverNative((p, s) =>
			S.ssrChild(
				S.createElement(
					'section',
					null,
					S.createElement(Child, { scope: first, value: a }),
					S.createElement(Child, { scope: second, value: b }),
				),
				s,
			),
		);
		assert.throws(() => S.renderToString(Server), /Multiple data scopes claim native server key/);
		first.dispose();
		second.dispose();
	});

	test('completed pending snapshot output is rejected instead of transporting activity', () => {
		const scope = G.createScope({ scopeKey: 'dom-pending-snapshot' });
		const load = G.query('dom-pending-snapshot-loader', () => new Promise(() => {}));
		const resource = scope.asyncSignal$('resource', () => load(null));
		const Server = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, resource.snapshot().status), s),
		);
		assert.throws(() => S.renderToString(Server), /no serializable ready value/);
		scope.dispose();
	});

	test('deferred island adopts its own historical data after the root is live', async () => {
		const scope = G.createScope({ scopeKey: 'dom-deferred' });
		const count = scope.signal$('count', 'server');
		const ReaderS = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, scope.get(count)), s),
		);
		const Server = (p, s) =>
			S.ssrChild(
				S.createElement(
					'section',
					null,
					S.createElement('p', { class: 'outside' }, 'outside'),
					S.createElement(S.Hydrate, { when: p.when, split: false }, S.createElement(ReaderS)),
				),
				s,
			);
		const observations = [],
			slot = Symbol('island-layout');
		const Reader = native(() => {
			const value = scope.get(count);
			C.useLayoutEffect(
				() => {
					observations.push(value);
				},
				[value],
				slot,
			);
			return element('output', null, value);
		});
		const App = (p) =>
			element(
				'section',
				null,
				element('p', { class: 'outside' }, 'outside'),
				element(C.Hydrate, { when: p.when, split: false }, element(Reader)),
			);
		const blocked = HY.condition(false);
		const c = container();
		c.innerHTML = S.renderToString(Server, { when: blocked }).html;
		const output = c.querySelector('output'),
			outside = c.querySelector('.outside');
		scope.set(count, 'live');
		let r;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App, { when: blocked });
		});
		await settle();
		assert.equal(output.textContent, 'server');
		assert.deepEqual(observations, []);
		C.flushSync(() => r.render(App, { when: HY.condition(true) }));
		await settle();
		assert.equal(c.querySelector('output'), output);
		assert.equal(c.querySelector('.outside'), outside);
		assert.deepEqual(observations, ['server', 'live']);
		assert.equal(output.textContent, 'live');
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('streamed native seeds stay local to the accepted segment', async () => {
		const scope = G.createScope({ scopeKey: 'dom-stream-seeds' });
		const key = scope.signal$('key', 'a');
		let finishA, finishB;
		const first = new Promise((resolve) => {
			finishA = resolve;
		});
		const second = new Promise((resolve) => {
			finishB = resolve;
		});
		const load = G.query('dom-stream-seeds-loader', (arg) => (arg === 'a' ? first : second));
		const resource = scope.asyncSignal$('resource', () => load(scope.get(key)));
		const ReaderS = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, scope.get(resource)), s),
		);
		const Server = (p, s) =>
			S.ssrChild(
				S.createElement(
					S.Suspense,
					{ fallback: S.createElement('i', null, 'waiting') },
					S.createElement(ReaderS),
				),
				s,
			);
		const controller = new AbortController();
		const deadline = setTimeout(() => controller.abort(new Error('stream smoke timeout')), 3000);
		const stream = await S.renderToReadableStream(Server, undefined, { signal: controller.signal });
		const reader = stream.getReader(),
			decoder = new TextDecoder();
		let html = '';
		const shell = await reader.read();
		html += decoder.decode(shell.value);
		finishA('streamed-a');
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			html += decoder.decode(chunk.value);
		}
		await stream.allReady;
		clearTimeout(deadline);
		const c = container();
		c.innerHTML = html;
		for (const script of Array.from(c.querySelectorAll('script'))) {
			if (script.type === 'application/json') continue;
			dom.window.eval(script.textContent);
			script.remove();
		}
		const output = c.querySelector('output');
		assert.equal(output.textContent, 'streamed-a');
		scope.set(key, 'b');
		const observations = [],
			slot = Symbol('stream-layout');
		const Reader = native(() => {
			const value = scope.get(resource);
			C.useLayoutEffect(
				() => {
					observations.push(value);
				},
				[value],
				slot,
			);
			return element('output', null, value);
		});
		const App = () =>
			element(C.Suspense, { fallback: element('i', null, 'waiting') }, element(Reader));
		let r;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
			assert.equal(c.querySelector('output'), output);
			assert.equal(output.textContent, 'streamed-a');
		});
		assert.equal(observations[0], 'streamed-a');
		finishB('live-b');
		await settle();
		await settle();
		assert.equal(c.querySelector('output').textContent, 'live-b');
		r.unmount();
		scope.dispose();
		c.remove();
		delete window.$OCTS;
		delete window.$OCTRC;
		delete window.$OCTRX;
		delete window.$OCTRH;
	});

	test('local writable hook retains its slot and retires with its component', () => {
		const slot = Symbol('local-value'),
			effect = Symbol('local-handle');
		let handle;
		const App = native((p) => {
			const value = H.useSignal$(p.initial, slot);
			C.useLayoutEffect(
				() => {
					handle = value;
				},
				[value],
				effect,
			);
			return element('output', null, String(value.get()));
		});
		const c = container(),
			r = C.createRoot(c);
		C.flushSync(() => r.render(App, { initial: 1 }));
		const first = handle;
		assert.equal(c.textContent, '1');
		C.flushSync(() => {
			handle.set(4);
			assert.equal(handle.get(), 4);
		});
		assert.equal(c.textContent, '4');
		C.flushSync(() => r.render(App, { initial: 99 }));
		assert.equal(handle, first);
		assert.equal(c.textContent, '4');
		r.unmount();
		assert.throws(() => handle.get(), G.ScopeDisposedError);
		c.remove();
	});

	test('local writable server hook emits no shared seed and disposes after its pass', () => {
		const slot = Symbol('server-local-value');
		let handle;
		const Server = serverNative((p, s) => {
			const value = SH.useSignal$(7, slot);
			handle = value;
			return S.ssrChild(S.createElement('output', null, String(value.get())), s);
		});
		const rendered = S.renderToString(Server);
		assert.match(rendered.html, />7</);
		assert.equal(rendered.signals, undefined);
		assert.throws(() => handle.get(), G.ScopeDisposedError);
	});

	test('closing-script native payloads remain inert across SSR and adoption', () => {
		const payload = '</script><script>globalThis.nativeSeedInjection=true</script><!--<script>';
		const scope = G.createScope({ scopeKey: 'dom-script-seed' }),
			value = scope.signal$('value', payload);
		const Server = serverNative((p, s) =>
			S.ssrChild(S.createElement('output', null, value.get()), s),
		);
		const c = container();
		c.innerHTML = S.renderToString(Server).html;
		assert.equal(c.querySelectorAll('script:not([type="application/json"])').length, 0);
		value.set('live');
		const App = native(() => element('output', null, value.get()));
		let r;
		C.flushSync(() => {
			r = C.hydrateRoot(c, App);
			assert.equal(c.querySelector('output').textContent, payload);
		});
		assert.equal(c.textContent, 'live');
		assert.equal(global.nativeSeedInjection, undefined);
		r.unmount();
		scope.dispose();
		c.remove();
	});

	for (const island of [false, true])
		test(
			'early controlled input survives ' + (island ? 'island' : 'root') + ' native adoption',
			async () => {
				const scope = G.createScope({ scopeKey: 'dom-controlled-' + island }),
					value = scope.signal$('value', 'server');
				const InputS = serverNative((p, s) =>
					S.ssrChild(S.createElement('input', { value: value.get() }), s),
				);
				const Server = (p, s) =>
					S.ssrChild(
						island
							? S.createElement(S.Hydrate, { when: p.when, split: false }, S.createElement(InputS))
							: S.createElement(InputS),
						s,
					);
				const Input = native(() =>
					element('input', {
						value: value.get(),
						onInput: (e) => value.set(e.currentTarget.value),
					}),
				);
				const App = (p) =>
					island
						? element(C.Hydrate, { when: p.when, split: false }, element(Input))
						: element(Input);
				const blocked = HY.condition(false),
					c = container();
				c.innerHTML = S.renderToString(Server, { when: blocked }).html;
				const input = c.querySelector('input');
				input.value = 'entered early';
				input.focus();
				input.setSelectionRange(2, 7);
				value.set(input.value);
				let r;
				C.flushSync(() => {
					r = C.hydrateRoot(c, App, { when: blocked });
				});
				await settle();
				if (island) {
					C.flushSync(() => r.render(App, { when: HY.condition(true) }));
					await settle();
				}
				assert.equal(c.querySelector('input'), input);
				assert.equal(input.value, 'entered early');
				assert.equal(value.get(), 'entered early');
				assert.equal(document.activeElement, input);
				assert.deepEqual([input.selectionStart, input.selectionEnd], [2, 7]);
				input.value = 'entered later';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				await settle();
				assert.equal(input.value, 'entered later');
				assert.equal(value.get(), 'entered later');
				r.unmount();
				scope.dispose();
				c.remove();
			},
		);

	test('resource retry does not reset an already committed error boundary', async () => {
		let rejectFirst,
			resolveSecond,
			attempt = 0;
		const first = new Promise((resolve, reject) => {
			rejectFirst = reject;
		});
		const second = new Promise((resolve) => {
			resolveSecond = resolve;
		});
		const scope = G.createScope({ scopeKey: 'dom-error-reset' });
		const load = G.query('dom-error-reset-query', () => (attempt++ === 0 ? first : second));
		const resource = scope.asyncSignal$('resource', () => load(null));
		const Reader = native(() => element('output', null, resource.get()));
		const App = () =>
			element(
				C.ErrorBoundary,
				{ fallback: (error, reset) => element('button', { onClick: reset }, 'reset') },
				element(C.Suspense, { fallback: element('i', null, 'waiting') }, element(Reader)),
			);
		const c = container(),
			r = C.createRoot(c, { onCaughtError: () => {} });
		C.flushSync(() => r.render(App));
		rejectFirst(new Error('expected request failure'));
		await settle();
		await settle();
		const caught = c.querySelector('button');
		assert.ok(
			caught,
			'Expected error fallback; DOM=' + c.innerHTML + '; resource=' + resource.snapshot().status,
		);
		resource.retry();
		resolveSecond('recovered');
		await settle();
		await settle();
		assert.equal(c.querySelector('button'), caught);
		assert.equal(c.querySelector('output'), null);
		caught.click();
		await settle();
		assert.equal(c.querySelector('output').textContent, 'recovered');
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('detached error fallback accepts before outgoing cleanup writes', async () => {
		const scope = G.createScope({ scopeKey: 'dom-detached-catch' }),
			value = scope.signal$('value', 0),
			log = [];
		let reject;
		const pending = new Promise((resolve, fail) => {
			reject = fail;
		});
		const writerSlot = Symbol('writer'),
			fallbackSlot = Symbol('fallback');
		const Writer = () => {
			C.useLayoutEffect(() => () => value.set(1), [], writerSlot);
			return element('i', null, 'writer');
		};
		const Async = native(() => element('span', null, C.use(pending)));
		const Fallback = native(() => {
			const sampled = value.get();
			C.useLayoutEffect(
				() => {
					log.push(sampled + ':' + c.querySelector('output').textContent + ':' + value.get());
				},
				[sampled],
				fallbackSlot,
			);
			return element('output', null, String(sampled));
		});
		const App = () =>
			element(
				C.ErrorBoundary,
				{ fallback: () => element(Fallback) },
				element(
					'section',
					null,
					element(Writer),
					element(C.Suspense, { fallback: element('b', null, 'waiting') }, element(Async)),
				),
			);
		const c = container(),
			r = C.createRoot(c, { onCaughtError: () => {} });
		C.flushSync(() => r.render(App));
		reject(new Error('expected detached error'));
		await settle();
		await settle();
		assert.deepEqual(log, ['0:0:1', '1:1:1']);
		assert.equal(c.querySelector('output').textContent, '1');
		r.unmount();
		scope.dispose();
		c.remove();
	});

	test('timed native fallback accepts before primary layout cleanup writes', async () => {
		const previous = C.getTransitionFallbackTimeout();
		C.setTransitionFallbackTimeout(5);
		const scope = G.createScope({ scopeKey: 'dom-timed-fallback' }),
			value = scope.signal$('value', 0),
			log = [];
		const ready = Promise.resolve('ready');
		ready.status = 'fulfilled';
		ready.value = 'ready';
		const pending = new Promise(() => {}),
			primarySlot = Symbol('primary'),
			fallbackSlot = Symbol('fallback');
		const Primary = native((p) => {
			const result = C.use(p.promise);
			C.useLayoutEffect(() => () => value.set(1), [], primarySlot);
			return element('span', null, result);
		});
		const Fallback = native(() => {
			const sampled = value.get();
			C.useLayoutEffect(
				() => {
					log.push(sampled + ':' + c.querySelector('output').textContent + ':' + value.get());
				},
				[sampled],
				fallbackSlot,
			);
			return element('output', null, String(sampled));
		});
		const App = (p) => element(C.Suspense, { fallback: element(Fallback) }, element(Primary, p));
		const c = container(),
			r = C.createRoot(c);
		try {
			C.flushSync(() => r.render(App, { promise: ready }));
			const primary = c.querySelector('span');
			C.flushSync(() => C.startTransition(() => r.render(App, { promise: pending })));
			assert.equal(c.querySelector('output'), null);
			await new Promise((resolve) => setTimeout(resolve, 20));
			await settle();
			assert.equal(c.querySelector('span'), primary);
			assert.equal(primary.style.display, 'none');
			assert.deepEqual(log, ['0:0:1', '1:1:1']);
			assert.equal(c.querySelector('output').textContent, '1');
		} finally {
			r.unmount();
			scope.dispose();
			c.remove();
			C.setTransitionFallbackTimeout(previous);
		}
	});

	test('catch teardown does not detach an already hidden primary ref twice', async () => {
		const ready = Promise.resolve('ready');
		ready.status = 'fulfilled';
		ready.value = 'ready';
		let reject;
		const pending = new Promise((resolve, fail) => {
			reject = fail;
		});
		const refs = [];
		const ref = (node) => {
			refs.push(node === null ? 'detach' : 'attach');
		};
		const Primary = native((p) => element('span', { ref }, C.use(p.promise)));
		const App = (p) =>
			element(
				C.ErrorBoundary,
				{ fallback: () => element('b', null, 'caught') },
				element(C.Suspense, { fallback: element('i', null, 'waiting') }, element(Primary, p)),
			);
		const c = container(),
			r = C.createRoot(c, { onCaughtError: () => {} });
		C.flushSync(() => r.render(App, { promise: ready }));
		C.flushSync(() => r.render(App, { promise: pending }));
		assert.deepEqual(refs, ['attach', 'detach']);
		reject(new Error('expected hidden failure'));
		await settle();
		await settle();
		assert.equal(c.textContent, 'caught');
		assert.deepEqual(refs, ['attach', 'detach']);
		r.unmount();
		c.remove();
	});

	test('server render-phase retries discard native reads from the abandoned output', () => {
		const scope = G.createScope({ scopeKey: 'dom-server-replay' });
		const load = G.query('dom-server-replay-query', () => new Promise(() => {}));
		const resource = scope.asyncSignal$('resource', () => load(null));
		const slot = Symbol('render-phase-state');
		const Server = serverNative((p, s) => {
			const [phase, setPhase] = S.useState(0, slot);
			if (phase === 0) {
				resource.snapshot();
				setPhase(1);
			}
			return S.ssrChild(S.createElement('output', null, 'done'), s);
		});
		const rendered = S.renderToString(Server);
		assert.match(rendered.html, />done</);
		assert.equal(rendered.signals, undefined);
		scope.dispose();
	});

	for (const phase of ['ref', 'layout'])
		test('root supersession in ' + phase + ' cancels later accepted native callbacks', () => {
			const scope = G.createScope({ scopeKey: 'dom-supersession-' + phase }),
				value = scope.signal$('value', 1),
				log = [];
			const first = Symbol('first-layout'),
				second = Symbol('second-layout'),
				c = container(),
				r = C.createRoot(c);
			const Reader = native((p) => {
				const sampled = value.get();
				C.useLayoutEffect(
					() => {
						log.push('layout-first:' + p.label);
						if (phase === 'layout' && p.label === 'A') r.render(Reader, { label: 'B' });
					},
					[p.label],
					first,
				);
				C.useLayoutEffect(
					() => {
						log.push('layout-second:' + p.label);
					},
					[p.label],
					second,
				);
				return element(
					'section',
					null,
					element(
						'span',
						{
							ref: (node) => {
								if (node === null) return;
								log.push('ref-first:' + p.label);
								if (phase === 'ref' && p.label === 'A') r.render(Reader, { label: 'B' });
							},
						},
						p.label + ':' + sampled,
					),
					element(
						'span',
						{
							ref: (node) => {
								if (node !== null) log.push('ref-second:' + p.label);
							},
						},
						p.label + ':' + sampled,
					),
				);
			});
			try {
				r.render(Reader, { label: 'A' });
				C.flushSync(() => {});
				assert.equal(c.textContent, 'B:1B:1');
				const after = log.slice(log.indexOf(phase + '-first:A') + 1);
				assert.deepEqual(
					after.filter((entry) => entry.endsWith(':A')),
					[],
				);
				assert.ok(log.includes('layout-second:B'));
				C.flushSync(() => value.set(2));
				assert.equal(c.textContent, 'B:2B:2');
			} finally {
				r.unmount();
				scope.dispose();
				c.remove();
			}
		});

	test('ordinary signal writes keep the accepted native callback snapshot', () => {
		const scope = G.createScope({ scopeKey: 'dom-accepted-ref-write' }),
			value = scope.signal$('value', 1),
			log = [];
		const slot = Symbol('layout'),
			c = container(),
			r = C.createRoot(c);
		const Reader = native(() => {
			const sampled = value.get();
			C.useLayoutEffect(
				() => {
					log.push('layout:' + sampled);
				},
				[sampled],
				slot,
			);
			return element(
				'section',
				null,
				element(
					'span',
					{
						ref: (node) => {
							if (node === null) return;
							log.push('ref-first:' + sampled);
							if (sampled === 1) value.set(2);
						},
					},
					String(sampled),
				),
				element(
					'span',
					{
						ref: (node) => {
							if (node !== null) log.push('ref-second:' + sampled);
						},
					},
					String(sampled),
				),
			);
		});
		try {
			r.render(Reader);
			C.flushSync(() => {});
			assert.deepEqual(log.slice(0, 3), ['ref-first:1', 'ref-second:1', 'layout:1']);
			assert.equal(c.textContent, '22');
		} finally {
			r.unmount();
			scope.dispose();
			c.remove();
		}
	});

	for (const kind of ['callback', 'object'])
		test(
			'superseded stable ' +
				kind +
				' ref and explicit-deps setup publish on the next accepted render',
			() => {
				const scope = G.createScope({ scopeKey: 'dom-stable-publication-' + kind }),
					value = scope.signal$('value', 1),
					log = [],
					refs = [];
				const slot = Symbol('constant-layout'),
					c = container(),
					r = C.createRoot(c);
				let current = null;
				const attach = (node) => {
					current = node;
					refs.push(node === null ? 'detach' : 'attach');
				};
				const stable =
					kind === 'callback'
						? attach
						: {
								get current() {
									return current;
								},
								set current(node) {
									attach(node);
								},
							};
				const Reader = native((p) => {
					const sampled = value.get();
					C.useLayoutEffect(
						() => {
							log.push('setup:' + p.label);
							return () => log.push('cleanup:' + p.label);
						},
						[123],
						slot,
					);
					return element(
						'section',
						null,
						element(
							'span',
							{
								ref: (node) => {
									if (node !== null && p.label === 'A') r.render(Reader, { label: 'B' });
								},
							},
							p.label + ':' + sampled,
						),
						element('span', { className: 'stable', ref: stable }, p.label + ':' + sampled),
					);
				});
				try {
					r.render(Reader, { label: 'A' });
					C.flushSync(() => {});
					const host = c.querySelector('.stable');
					assert.equal(current, host);
					assert.deepEqual(refs, ['attach']);
					assert.deepEqual(log, ['setup:B']);
					C.flushSync(() => r.render(Reader, { label: 'C' }));
					assert.equal(current, host);
					assert.equal(c.querySelector('.stable'), host);
					assert.deepEqual(refs, ['attach']);
					assert.deepEqual(log, ['setup:B']);
					r.unmount();
					assert.equal(current, null);
					assert.deepEqual(refs, ['attach', 'detach']);
					assert.deepEqual(log, ['setup:B', 'cleanup:B']);
				} finally {
					r.unmount();
					scope.dispose();
					c.remove();
				}
			},
		);

	const results = [];
	for (const { name, fn } of tests) {
		try {
			await fn();
			results.push({ name, status: 'passed' });
			console.log('PASS ' + name);
		} catch (error) {
			results.push({ name, status: 'failed', error: String(error.stack ?? error) });
			console.error('FAIL ' + name);
			console.error(error.stack ?? error);
		}
	}
	const failures = results.filter((result) => result.status === 'failed').length;
	const changedInputs = sourceInputs
		.filter((input) => hash(fs.readFileSync(input.absolutePath)) !== input.sha256)
		.map((input) => input.path);
	const report = {
		suite: 'scoped-signals-native-dom-abi',
		status: failures ? 'failed' : changedInputs.length ? 'inputs-changed' : 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		toolingRoot,
		versions: {
			esbuild: esbuild.version,
			jsdom: packageVersion('jsdom'),
			alienSignals: packageVersion('alien-signals/system'),
		},
		runnerSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
		request: process.argv,
		sourceInputs,
		changedInputs,
		total: results.length,
		passed: results.length - failures,
		results,
		limitations: [
			'Manual compiler ABI fences with real source runtime and graph; not .tsrx compilation coverage.',
			'A single development-mode bundle preserves one shared protocol instance; publication conditions are tested separately.',
			'jsdom behavior is supplemental to real-browser focus, native-event, hydration, and lifecycle tests.',
			'No performance, canonical CI, or retained-heap claim; the isolated process exits after these behavioral checks.',
		],
	};
	fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
	fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
	console.log(`${report.passed}/${report.total} DOM ABI smoke cases passed`);
	if (changedInputs.length)
		console.error('Inputs changed during the run: ' + changedInputs.join(', '));
	dom.window.close();
	process.exit(failures || changedInputs.length ? 1 : 0);
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
