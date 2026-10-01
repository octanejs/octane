// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
import { load } from 'octane/hydration';
import { loadServerFixture } from '../_server-fixture.js';
import type * as Fixture from './_fixtures/split-hydrate-local-bindings.tsrx';

// Directive-local bindings inside and around split `<Hydrate>` boundaries. The
// server renders every boundary inline. The client parent and each split child
// are compiled from the same source, bundled together, and hydrated over the
// server HTML in development and production.

type Props = Fixture.Props;
type Input = Omit<Props, 'when' | 'onPick'>;
type View = Exclude<keyof typeof Fixture, 'Props' | 'Failure'>;

const fixtures = resolve(import.meta.dirname, '_fixtures');
const filename = resolve(fixtures, 'split-hydrate-local-bindings.tsrx');
const authored = readFileSync(filename, 'utf8');
const server = loadServerFixture<typeof Fixture>(filename);
const bundles = new Map<boolean, Promise<string>>();

function bundle(dev: boolean) {
	let cached = bundles.get(dev);
	if (cached !== undefined) return cached;
	const source = (id: string) => {
		const output = compile(authored, id, { dev, hmr: false });
		expect(output.diagnostics).toEqual([]);
		return { contents: output.code, loader: 'js' as const, resolveDir: fixtures };
	};
	cached = build({
		stdin: {
			...source(filename),
			contents:
				source(filename).contents +
				'\nexport { act, flushSync, hydrateRoot } from "octane";' +
				'\nexport { load } from "octane/hydration";',
		},
		plugins: [
			{
				name: 'authored-hydrate-query',
				setup(builder) {
					builder.onResolve({ filter: /\?octane-hydrate=/ }, (args) => ({
						path: resolve(args.resolveDir, args.path),
						namespace: 'authored-hydrate-query',
					}));
					builder.onLoad({ filter: /.*/, namespace: 'authored-hydrate-query' }, (args) =>
						source(args.path),
					);
				},
			},
		],
		bundle: true,
		write: false,
		format: 'iife',
		globalName: '__SPLIT_LOCAL_BINDINGS__',
		platform: 'browser',
		target: 'esnext',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
	}).then((result) => result.outputFiles[0].text);
	bundles.set(dev, cached);
	return cached;
}

function message(error: unknown) {
	return String((error as { message?: unknown })?.message ?? error);
}

// Server and client own separate failure records, as separate processes would.
function copy(input: Input): Input {
	return {
		...input,
		state: { ...input.state },
		inner: { ...input.inner },
		rows: [...input.rows],
	};
}

async function hydrate(dev: boolean, view: View, input: Input) {
	const code = await bundle(dev);
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	const diagnostics: unknown[][] = [];
	for (const level of ['warn', 'error'] as const)
		window.console[level] = (...args: unknown[]) => diagnostics.push(args);
	const thrown: string[] = [];
	window.addEventListener('error', (event: any) => thrown.push(message(event.error ?? event)));
	const channels: MessageChannel[] = [];
	class ConsumerChannel extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	}
	(window as any).MessageChannel = ConsumerChannel;
	window.document.body.innerHTML = '<div id="host"></div>';
	window.eval(code);
	const api = (window as any).__SPLIT_LOCAL_BINDINGS__;
	const host = window.document.getElementById('host')!;
	host.innerHTML = renderToString(server[view], {
		...copy(input),
		when: load(),
		onPick() {},
	}).html;
	const serverHtml = host.innerHTML;
	const picks: string[] = [];
	const caught: string[] = [];
	const uncaught: string[] = [];
	const recoverable: string[] = [];
	let props: Props = { ...copy(input), when: api.load(), onPick: (value) => picks.push(value) };
	let root: any;
	try {
		root = api.hydrateRoot(host, api[view], props, {
			onCaughtError: (error: unknown) => caught.push(message(error)),
			onUncaughtError: (error: unknown) => uncaught.push(message(error)),
			onRecoverableError: (error: unknown) => recoverable.push(message(error)),
		});
	} catch (error) {
		thrown.push(message(error));
	}
	await api.act(() => {});
	return {
		host,
		serverHtml,
		picks,
		caught,
		// Every failure a consumer would see: thrown render or handler errors,
		// root-reported errors, and console diagnostics such as mismatches.
		failures: () => ({ thrown, uncaught, recoverable, diagnostics }),
		click: (selector: string) =>
			api.act(() => (host.querySelector(selector) as unknown as HTMLElement).click()),
		update: (next: Partial<Props>) =>
			api.act(() => root.render(api[view], (props = { ...props, ...next }))),
		text: (selector: string) =>
			[...host.querySelectorAll(selector)].map((node) => node.textContent?.trim()),
		close() {
			if (root) api.flushSync(() => root.unmount());
			for (const channel of channels) {
				channel.port1.close();
				channel.port2.close();
			}
			window.close();
		},
	};
}

const none = { thrown: [], uncaught: [], recoverable: [], diagnostics: [] };
const base: Input = {
	state: { failed: false },
	inner: { failed: false },
	rows: [],
	kind: 'a',
	label: 'first',
};

for (const dev of [false, true]) {
	describe(`${dev ? 'development' : 'production'} split Hydrate directive bindings`, () => {
		it('hydrates server error content and resets the boundary through the @catch reset parameter', async () => {
			const page = await hydrate(dev, 'CatchReset', { ...base, state: { failed: true } });
			try {
				expect(page.serverHtml).toContain('catch failed');
				const button = page.host.querySelector('.retry');
				expect(page.failures()).toEqual(none);
				expect(page.caught).toEqual(['catch failed']);
				expect(page.host.querySelector('.retry')).toBe(button);
				expect(page.text('.retry')).toEqual(['catch failed']);

				await page.click('.retry');
				expect(page.text('.result')).toEqual(['catch ready']);
				expect(page.text('.retry')).toEqual([]);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('keeps nested @catch reset parameters local to the split child', async () => {
			const page = await hydrate(dev, 'NestedCatch', {
				...base,
				state: { failed: true },
				inner: { failed: true },
			});
			try {
				expect(page.failures()).toEqual(none);
				expect(page.caught).toEqual(['outer failed']);
				expect(page.text('button')).toEqual(['outer failed']);

				// The outer reset re-renders its body, where the inner boundary now fails.
				await page.click('.outer-retry');
				expect(page.text('.result')).toEqual(['outer ready']);
				expect(page.text('button')).toEqual(['inner failed']);
				expect(page.caught).toEqual(['outer failed', 'inner failed']);

				await page.click('.inner-retry');
				expect(page.text('.result')).toEqual(['outer ready', 'inner ready']);
				expect(page.text('button')).toEqual([]);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('reads the @for index in row keys, text, and handlers', async () => {
			const page = await hydrate(dev, 'IndexedRows', { ...base, rows: ['a', 'b'] });
			try {
				const buttons = [...page.host.querySelectorAll('button')];
				expect(page.failures()).toEqual(none);
				expect([...page.host.querySelectorAll('button')]).toEqual(buttons);
				expect(page.text('button')).toEqual(['a@0', 'b@1']);

				await page.click('li:nth-child(2) button');
				expect(page.picks).toEqual(['b@1']);
				await page.update({ rows: ['c', 'a', 'b'] });
				expect(page.text('button')).toEqual(['c@0', 'a@1', 'b@2']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('resolves @empty against the enclosing scope rather than the loop binding', async () => {
			const page = await hydrate(dev, 'EmptyRows', { ...base, label: 'nothing' });
			try {
				expect(page.serverHtml).toContain('nothing');
				expect(page.failures()).toEqual(none);
				expect(page.text('li')).toEqual(['nothing']);

				await page.update({ rows: ['x'] });
				expect(page.text('li')).toEqual(['x']);
				await page.update({ rows: [], label: 'still nothing' });
				expect(page.text('li')).toEqual(['still nothing']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('keeps @switch arm locals inside the split child', async () => {
			const page = await hydrate(dev, 'SwitchArm', base);
			try {
				expect(page.failures()).toEqual(none);
				expect(page.text('.arm')).toEqual(['first arm']);

				await page.update({ label: 'second' });
				expect(page.text('.arm')).toEqual(['second arm']);
				await page.update({ kind: 'b' });
				expect(page.text('.arm')).toEqual(['default']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('keeps switch case locals in a handler inside the split child', async () => {
			const page = await hydrate(dev, 'SwitchHandler', base);
			try {
				expect(page.failures()).toEqual(none);
				await page.click('.pick');
				await page.update({ kind: 'b' });
				await page.click('.pick');
				expect(page.picks).toEqual(['first:a', 'default']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('passes a @catch reset parameter that shadows a module function into a nested boundary', async () => {
			const page = await hydrate(dev, 'ShadowedReset', { ...base, state: { failed: true } });
			try {
				expect(page.failures()).toEqual(none);
				expect(page.text('.retry')).toEqual(['shadowed failed']);

				await page.click('.retry');
				expect(page.text('.result')).toEqual(['shadowed ready']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('passes an @for index that shadows a module binding into a nested boundary', async () => {
			const page = await hydrate(dev, 'ShadowedIndex', { ...base, rows: ['a', 'b'] });
			try {
				expect(page.serverHtml).toContain('b@1');
				expect(page.failures()).toEqual(none);
				expect(page.text('button')).toEqual(['a@0', 'b@1']);

				await page.click('li:nth-child(2) button');
				expect(page.picks).toEqual(['b@1']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});

		it('passes an @switch arm local that shadows a module binding into a nested boundary', async () => {
			const page = await hydrate(dev, 'ShadowedArm', base);
			try {
				expect(page.serverHtml).toContain('first heading');
				expect(page.failures()).toEqual(none);
				expect(page.text('h2')).toEqual(['first heading']);

				await page.update({ label: 'second' });
				expect(page.text('h2')).toEqual(['second heading']);
				expect(page.failures()).toEqual(none);
			} finally {
				page.close();
			}
		});
	});
}
