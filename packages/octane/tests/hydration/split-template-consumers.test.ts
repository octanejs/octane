// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { Window } from 'happy-dom';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { renderToString } from 'octane/server';
import { condition, load } from 'octane/hydration';
import { loadServerFixture } from '../_server-fixture.js';
import type * as client from './_fixtures/split-template-lifecycle.tsrx';

const filename = resolve(import.meta.dirname, '_fixtures/split-template-lifecycle.tsrx');
const server = loadServerFixture<typeof client>(filename);

async function consumer(dev: boolean) {
	const authored = await readFile(filename, 'utf8');
	const result = await build({
		stdin: {
			contents: compile(authored, filename, { dev, hmr: false }).code,
			resolveDir: resolve(import.meta.dirname, '_fixtures'),
			loader: 'js',
		},
		plugins: [
			{
				name: 'authored-hydrate-query',
				setup(build) {
					build.onResolve({ filter: /\?octane-hydrate=/ }, (args) => ({
						path: resolve(args.resolveDir, args.path),
						namespace: 'authored-hydrate-query',
					}));
					build.onLoad({ filter: /.*/, namespace: 'authored-hydrate-query' }, (args) => ({
						contents: compile(authored, args.path, { dev, hmr: false }).code,
						loader: 'js',
						resolveDir: resolve(import.meta.dirname, '_fixtures'),
					}));
				},
			},
		],
		bundle: true,
		write: false,
		format: 'iife',
		globalName: '__SPLIT_CONSUMER__',
		platform: 'browser',
		target: 'esnext',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
	});
	const code = result.outputFiles[0].text;
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	const channels: MessageChannel[] = [];
	class ConsumerMessageChannel extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	}
	(window as unknown as { MessageChannel: typeof MessageChannel }).MessageChannel =
		ConsumerMessageChannel;
	window.document.body.innerHTML = '<div id="host"></div>';
	window.eval(code);
	return {
		window,
		host: window.document.querySelector('#host') as unknown as HTMLElement,
		api: (window as unknown as { __SPLIT_CONSUMER__: typeof client }).__SPLIT_CONSUMER__,
		close() {
			for (const channel of channels) {
				channel.port1.close();
				channel.port2.close();
			}
			window.close();
		},
	};
}

for (const dev of [false, true]) {
	describe(`${dev ? 'development' : 'production'} split template consumers`, () => {
		it('adopts server UI and preserves native drafts, IDs, events and cleanup after loading', async () => {
			const view = await consumer(dev);
			const effects: string[] = [];
			const clicked: string[] = [];
			let hydrated = 0;
			const props = {
				when: load(),
				label: 'first',
				onEffect: (phase: string) => effects.push(phase),
				onClick: (id: string) => clicked.push(id),
				onHydrated: () => hydrated++,
			};
			try {
				view.host.innerHTML = renderToString(server.TemplateBoundary, props).html;
				const editor = view.host.querySelector('#split-template-editor')!;
				const button = view.host.querySelector<HTMLButtonElement>('#split-template-action')!;
				const input = view.host.querySelector<HTMLInputElement>('#split-template-draft')!;
				const id = editor.getAttribute('data-runtime-id');
				input.value = 'draft before loading';
				input.focus();
				input.setSelectionRange(2, 7);
				const root = view.api.start(view.host, 'TemplateBoundary', props, true);
				await root.settle();
				button.click();
				await root.settle();
				expect(button.textContent).toBe('first:1');
				expect(clicked).toEqual([id]);
				expect(hydrated).toBe(1);
				await root.update({ ...props, label: 'latest' });
				expect(button.textContent).toBe('latest:1');
				expect(view.host.querySelector('#split-template-editor')).toBe(editor);
				expect(view.host.querySelector('#split-template-draft')).toBe(input);
				expect(input.value).toBe('draft before loading');
				expect(view.window.document.activeElement).toBe(input);
				expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
				root.unmount();
				expect(effects).toEqual(['mount', 'cleanup']);
				expect(view.host.childNodes.length).toBe(0);
			} finally {
				view.close();
			}
		});

		it('preloads without mounting and reads the latest captures when activation becomes ready', async () => {
			const view = await consumer(dev);
			const effects: string[] = [];
			let preloaded = false;
			const props = {
				when: condition(false),
				label: 'old',
				prefetch: async ({ preload }: { preload: () => Promise<void> }) => {
					await preload();
					preloaded = true;
				},
				onEffect: (phase: string) => effects.push(phase),
			};
			try {
				view.host.innerHTML = renderToString(server.TemplateBoundary, props).html;
				const button = view.host.querySelector('#split-template-action')!;
				const root = view.api.start(view.host, 'TemplateBoundary', props, true);
				await root.settle();
				expect(preloaded).toBe(true);
				expect(effects).toEqual([]);
				await root.update({ ...props, label: 'latest', when: load() });
				expect(button.textContent).toBe('latest:0');
				expect(view.host.querySelector('#split-template-action')).toBe(button);
				root.unmount();
				expect(effects).toEqual(['mount', 'cleanup']);
			} finally {
				view.close();
			}
		});

		it('retries pending child data and retains state through the next parent update', async () => {
			const view = await consumer(dev);
			let release!: () => void;
			const pending = new Promise<void>((complete) => (release = complete)),
				effects: string[] = [];
			const props = {
				when: load(),
				label: 'first',
				pending,
				onEffect: (phase: string) => effects.push(phase),
			};
			try {
				const root = view.api.start(view.host, 'ClientPendingBoundary', props);
				await root.settle();
				expect(view.host.querySelector('#split-outer-pending')).toBeNull();
				await root.release(release);
				const button = view.host.querySelector<HTMLButtonElement>('#split-template-action')!;
				button.click();
				await root.settle();
				await root.update({ ...props, label: 'retry' });
				expect(button.textContent).toBe('retry:1');
				expect(view.host.querySelector('#split-template-action')).toBe(button);
				root.unmount();
				expect(effects).toEqual(['mount', 'cleanup']);
				expect(view.host.childNodes.length).toBe(0);
			} finally {
				view.close();
			}
		});

		it('keeps a local empty pending arm and retires activation before obsolete data settles', async () => {
			const view = await consumer(dev);
			let release!: () => void;
			const pending = new Promise<void>((complete) => (release = complete));
			const effects: string[] = [];
			try {
				const root = view.api.start(view.host, 'ClientPendingBoundary', {
					when: load(),
					label: 'ready',
					pending,
					onEffect: (phase) => effects.push(phase),
				});
				await root.settle();
				expect(view.host.querySelector('#split-outer-pending')).toBeNull();
				expect(view.host.querySelector('#split-template-editor')).toBeNull();
				root.unmount();
				await root.release(release);
				expect(view.host.childNodes.length).toBe(0);
				expect(effects).toEqual([]);
			} finally {
				view.close();
			}
		});

		it('preserves descriptor children and shadowed value-returning components', async () => {
			const view = await consumer(dev);
			try {
				expect(await view.api.descriptorControls(view.host)).toEqual({
					descriptor: 'descriptor',
					shadow: 'shadowed',
					cleaned: true,
				});
			} finally {
				view.close();
			}
		});

		it('renders authored explicit and spread fallback output before retrying the loaded child', async () => {
			const view = await consumer(dev);
			try {
				for (const name of ['ExplicitFallbackBoundary', 'SpreadBoundary']) {
					let release!: () => void;
					const pending = new Promise<void>((complete) => (release = complete));
					const fallback = 'authored pending';
					const root = view.api.start(view.host, name, {
						when: load(),
						label: 'ready',
						pending,
						fallback,
						...(name === 'SpreadBoundary' ? { boundary: { fallback } } : {}),
					});
					await root.settle();
					expect(view.host.textContent).toBe('authored pending');
					await root.release(release);
					expect(view.host.querySelector('#split-template-action')!.textContent).toBe('ready:0');
					root.unmount();
					expect(view.host.childNodes.length).toBe(0);
				}
			} finally {
				view.close();
			}
		});
	});
}
