// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { Window } from 'happy-dom';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
import { condition, load } from 'octane/hydration';
import { loadServerFixture } from '../_server-fixture.js';
import type * as client from './_fixtures/split-template-lifecycle.tsrx';
import type * as updatedAttributesClient from './_fixtures/split-hydrate-updated-attributes.tsrx';
import type * as fragmentClient from './_fixtures/split-hydrate-fragments.tsrx';

const filename = resolve(import.meta.dirname, '_fixtures/split-template-lifecycle.tsrx');
const server = loadServerFixture<typeof client>(filename);
const updatedAttributesFilename = resolve(
	import.meta.dirname,
	'_fixtures/split-hydrate-updated-attributes.tsrx',
);
const updatedAttributesServer =
	loadServerFixture<typeof updatedAttributesClient>(updatedAttributesFilename);
const fragmentsFilename = resolve(import.meta.dirname, '_fixtures/split-hydrate-fragments.tsrx');
const fragmentsServer = loadServerFixture<typeof fragmentClient>(fragmentsFilename);

async function consumer<T = typeof client>(dev: boolean, fixtureFilename = filename) {
	const authored = await readFile(fixtureFilename, 'utf8');
	const result = await build({
		stdin: {
			contents: compile(authored, fixtureFilename, { dev, hmr: false }).code,
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
	const diagnostics: { level: 'warn' | 'error'; args: unknown[] }[] = [];
	for (const level of ['warn', 'error'] as const) {
		const original = window.console[level];
		window.console[level] = (...args) => {
			diagnostics.push({ level, args });
			original.apply(window.console, args);
		};
	}
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
		diagnostics,
		host: window.document.querySelector('#host') as unknown as HTMLElement,
		api: (window as unknown as { __SPLIT_CONSUMER__: T }).__SPLIT_CONSUMER__,
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
		for (const general of [false, true]) {
			for (const initiallyVisible of [false, true]) {
				it(`activates an ${initiallyVisible ? 'initially visible' : 'initially empty'} fragment with ${general ? 'stateful' : 'plain'} headings and keeps its surrounding server controls`, async () => {
					const view = await consumer<typeof fragmentClient>(dev, fragmentsFilename);
					const effects: [string, string][] = [];
					const refs: (HTMLElement | null)[] = [];
					const clicked: string[] = [];
					const props = {
						when: condition(false),
						show: initiallyVisible,
						label: 'server',
						tone: 'server-tone',
						opacity: 0.5,
						rows: ['first-row'],
						general,
						onEffect: (phase: 'mount' | 'cleanup', row: string) => effects.push([phase, row]),
						onRef: (node: HTMLElement | null) => refs.push(node),
						onClick: (label: string) => clicked.push(label),
					};
					try {
						const View = general ? fragmentsServer.GeneralBoundary : fragmentsServer.LiteBoundary;
						view.host.innerHTML = renderToString(View, props).html;
						const prefix = view.host.querySelector('[data-row-prefix]')!;
						const tail = view.host.querySelector<HTMLInputElement>('[data-row-tail]')!;
						const outside = view.host.querySelector<HTMLInputElement>('#fragment-outside')!;
						const serverSection = view.host.querySelector<HTMLElement>('section');
						const serverHeadings = [...view.host.querySelectorAll('h2')];
						tail.value = 'edited row draft';
						outside.value = 'edited outside draft';
						const root = view.api.start(view.host, props);
						await root.settle();
						expect(effects).toEqual([]);
						expect(refs).toEqual([]);
						const activeProps = {
							...props,
							when: load(),
							show: true,
							label: 'active',
							tone: 'active-tone',
							opacity: 1,
						};
						await root.update(activeProps);
						const section = view.host.querySelector<HTMLElement>('section')!;
						const headings = [...view.host.querySelectorAll<HTMLElement>('h2')];
						expect(headings.map((node) => node.textContent)).toEqual(
							general ? ['active:0', 'active:0'] : ['active', 'active'],
						);
						expect(section.className).toBe('active-tone');
						expect(section.style.opacity).toBe('1');
						expect(section.dataset.region).toBe('fragment region');
						if (initiallyVisible) {
							expect(section).toBe(serverSection);
							headings.forEach((node, index) => expect(node).toBe(serverHeadings[index]));
						}
						expect(view.host.querySelector('[data-row-prefix]')).toBe(prefix);
						expect(view.host.querySelector('[data-row-tail]')).toBe(tail);
						expect(view.host.querySelector('#fragment-outside')).toBe(outside);
						expect(tail.value).toBe('edited row draft');
						expect(outside.value).toBe('edited outside draft');
						expect(refs).toEqual([section]);
						if (general) {
							headings[0].click();
							await root.settle();
						}
						const updatedProps = { ...activeProps, label: 'updated', tone: 'muted', opacity: 0.4 };
						await root.update(updatedProps);
						expect(view.host.querySelector('section')).toBe(section);
						[...view.host.querySelectorAll('h2')].forEach((node, index) =>
							expect(node).toBe(headings[index]),
						);
						expect(headings.map((node) => node.textContent)).toEqual(
							general ? ['updated:1', 'updated:0'] : ['updated', 'updated'],
						);
						expect(section.className).toBe('muted');
						expect(section.style.opacity).toBe('0.4');
						expect(refs).toEqual([section]);
						section.querySelector('button')!.click();
						await root.settle();
						expect(clicked).toEqual(['updated']);
						await root.update({ ...updatedProps, show: false });
						expect(view.host.querySelector('section')).toBeNull();
						expect(view.host.querySelector('h2')).toBeNull();
						expect(refs).toEqual([section, null]);
						await root.update(updatedProps);
						const reentered = view.host.querySelector<HTMLElement>('section')!;
						expect(reentered).not.toBe(section);
						expect(view.host.querySelector('h2')!.textContent).toBe(
							general ? 'updated:0' : 'updated',
						);
						await root.update({ ...updatedProps, rows: ['replacement-row'] });
						const replacement = view.host.querySelector<HTMLElement>('section')!;
						expect(replacement).not.toBe(reentered);
						expect(replacement.dataset.fragmentSection).toBe('replacement-row');
						expect(view.host.querySelector('[data-row="first-row"]')).toBeNull();
						expect(view.host.querySelector('#fragment-outside')).toBe(outside);
						expect(outside.value).toBe('edited outside draft');
						expect(root.recoverable).toEqual([]);
						root.unmount();
						expect(refs.filter((node) => node !== null)).toEqual([section, reentered, replacement]);
						expect(refs.at(-1)).toBeNull();
						for (const phase of ['mount', 'cleanup']) {
							expect(effects.filter(([event]) => event === phase).map(([, row]) => row)).toEqual([
								'first-row',
								'first-row',
								'replacement-row',
							]);
						}
						expect(view.host.childNodes.length).toBe(0);
						expect(view.diagnostics).toEqual([]);
					} finally {
						view.close();
					}
				});
			}
		}

		for (const mode of ['root', 'sole', 'direct'] as const) {
			for (const initiallyVisible of [false, true]) {
				it(`preserves surrounding controls when an ${initiallyVisible ? 'initially visible' : 'initially empty'} ${mode} fragment becomes visible`, async () => {
					const view = await consumer<typeof fragmentClient>(dev, fragmentsFilename);
					const props = {
						when: condition(false),
						show: initiallyVisible,
						label: 'server',
						tone: 'server-tone',
						opacity: 0.5,
						rows: ['first-row'],
					};
					const View =
						mode === 'root'
							? fragmentsServer.RootBoundary
							: mode === 'sole'
								? fragmentsServer.SoleRootBoundary
								: fragmentsServer.DirectBoundary;
					try {
						view.host.innerHTML = renderToString(View, props).html;
						const outside = view.host.querySelector<HTMLInputElement>('#fragment-outside')!;
						const tail = view.host.querySelector<HTMLInputElement>('#fragment-root-tail');
						const serverSection = view.host.querySelector('section');
						outside.value = 'edited outside draft';
						if (tail) tail.value = 'edited root draft';
						const root = view.api.start(view.host, props, mode);
						await root.settle();
						await root.update({
							...props,
							show: true,
							label: 'active',
							tone: 'active-tone',
							opacity: 1,
							when: load(),
						});
						const section = view.host.querySelector<HTMLElement>('section')!;
						expect([...view.host.querySelectorAll('h2')].map((node) => node.textContent)).toEqual([
							'active',
							'active',
						]);
						expect(section.className).toBe('active-tone');
						expect(section.style.opacity).toBe('1');
						if (initiallyVisible) expect(section).toBe(serverSection);
						expect(view.host.querySelector('#fragment-outside')).toBe(outside);
						expect(outside.value).toBe('edited outside draft');
						if (tail) {
							expect(view.host.querySelector('#fragment-root-tail')).toBe(tail);
							expect(tail.value).toBe('edited root draft');
						}
						expect(root.recoverable).toEqual([]);
						root.unmount();
						expect(view.host.childNodes.length).toBe(0);
						expect(view.diagnostics).toEqual([]);
					} finally {
						view.close();
					}
				});
			}
		}

		for (const general of [false, true]) {
			it(`recovers a server host replaced by a component with ${general ? 'stateful' : 'plain'} headings and preserves the outside draft`, async () => {
				const view = await consumer<typeof fragmentClient>(dev, fragmentsFilename);
				const effects: [string, string][] = [];
				const refs: (HTMLElement | null)[] = [];
				const clicked: string[] = [];
				const props = {
					when: load(),
					show: true,
					label: 'client',
					tone: 'client-tone',
					opacity: 0.7,
					rows: ['replacement-row'],
					general,
					onEffect: (phase: 'mount' | 'cleanup', row: string) => effects.push([phase, row]),
					onRef: (node: HTMLElement | null) => refs.push(node),
					onClick: (label: string) => clicked.push(label),
				};
				try {
					view.host.innerHTML = renderToString(fragmentsServer.ReplacementBoundary, {
						...props,
						show: false,
						label: 'server',
					}).html;
					expect(view.host.querySelector('[data-server-host]')!.textContent).toBe('server');
					const outside = view.host.querySelector<HTMLInputElement>('#fragment-outside')!;
					outside.value = 'edited outside draft';
					const root = view.api.start(view.host, props, 'replacement');
					await root.settle();
					const section = view.host.querySelector<HTMLElement>('section')!;
					const headings = [...view.host.querySelectorAll<HTMLElement>('h2')];
					expect(headings.map((node) => node.textContent)).toEqual(
						general ? ['client:0', 'client:0'] : ['client', 'client'],
					);
					expect(view.host.querySelector('[data-server-host]')).toBeNull();
					expect(section.dataset.fragmentSection).toBe('replacement-row');
					expect(section.dataset.region).toBe('client');
					expect(section.className).toBe('client-tone');
					expect(section.style.opacity).toBe('0.7');
					expect(view.host.querySelector('#fragment-outside')).toBe(outside);
					expect(outside.value).toBe('edited outside draft');
					expect(refs).toEqual([section]);
					expect(effects).toEqual([['mount', 'replacement-row']]);
					section.querySelector('button')!.click();
					if (general) headings[0].click();
					await root.settle();
					expect(clicked).toEqual(['client']);
					if (general) expect(headings[0].textContent).toBe('client:1');
					expect(root.recoverable.length).toBeGreaterThan(0);
					root.unmount();
					expect(refs).toEqual([section, null]);
					expect(effects).toEqual([
						['mount', 'replacement-row'],
						['cleanup', 'replacement-row'],
					]);
					expect(view.host.childNodes.length).toBe(0);
					if (dev) {
						expect(
							view.diagnostics.some(
								({ level, args }) =>
									level === 'error' && String(args[0]).includes('hydration mismatch'),
							),
						).toBe(true);
					} else {
						expect(view.diagnostics).toEqual([]);
					}
				} finally {
					view.close();
				}
			});
		}

		for (const mode of ['row', 'root', 'sole', 'direct'] as const) {
			it(`reports an initial empty server versus visible client ${mode} fragment mismatch while keeping adjacent server controls`, async () => {
				const view = await consumer<typeof fragmentClient>(dev, fragmentsFilename);
				const props = {
					when: load(),
					show: true,
					label: 'client',
					tone: 'client-tone',
					opacity: 1,
					rows: ['first-row'],
				};
				const View =
					mode === 'root'
						? fragmentsServer.RootBoundary
						: mode === 'sole'
							? fragmentsServer.SoleRootBoundary
							: mode === 'direct'
								? fragmentsServer.DirectBoundary
								: fragmentsServer.LiteBoundary;
				try {
					view.host.innerHTML = renderToString(View, { ...props, show: false }).html;
					const outside = view.host.querySelector<HTMLInputElement>('#fragment-outside')!;
					const tail = view.host.querySelector<HTMLInputElement>(
						'[data-row-tail], #fragment-root-tail',
					);
					outside.value = 'edited outside draft';
					if (tail) tail.value = 'edited adjacent draft';
					const root = view.api.start(view.host, props, mode);
					await root.settle();
					expect([...view.host.querySelectorAll('h2')].map((node) => node.textContent)).toEqual([
						'client',
						'client',
					]);
					const section = view.host.querySelector<HTMLElement>('section')!;
					expect(section.className).toBe('client-tone');
					expect(section.style.opacity).toBe('1');
					expect(view.host.querySelector('#fragment-outside')).toBe(outside);
					expect(outside.value).toBe('edited outside draft');
					if (tail) {
						expect(view.host.querySelector('[data-row-tail], #fragment-root-tail')).toBe(tail);
						expect(tail.value).toBe('edited adjacent draft');
					}
					expect(root.recoverable.length).toBeGreaterThan(0);
					root.unmount();
					expect(view.host.childNodes.length).toBe(0);
					if (dev) {
						expect(
							view.diagnostics.some(
								({ level, args }) =>
									level === 'error' && String(args[0]).includes('hydration mismatch'),
							),
						).toBe(true);
					} else {
						expect(view.diagnostics).toEqual([]);
					}
				} finally {
					view.close();
				}
			});
		}

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

		it('reconciles updated attributes without mismatch diagnostics and preserves adopted controls', async () => {
			const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
			const effects: [string, string | null, boolean][] = [];
			const refs: (HTMLButtonElement | null)[] = [];
			const clicked: (string | null)[] = [];
			let hydrated = 0;
			let preloaded = false;
			const props = {
				when: condition(false),
				identity: null,
				hidden: true,
				prefetch: async ({ preload }: { preload: () => Promise<void> }) => {
					await preload();
					preloaded = true;
				},
				onEffect: (phase: 'mount' | 'cleanup', identity: string | null, hidden: boolean) =>
					effects.push([phase, identity, hidden]),
				onRef: (node: HTMLButtonElement | null) => refs.push(node),
				onClick: (identity: string | null) => clicked.push(identity),
				onHydrated: () => hydrated++,
			};
			try {
				view.host.innerHTML = renderToString(
					updatedAttributesServer.UpdatedAttributesBoundary,
					props,
				).html;
				const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
				const runtimeId = section.getAttribute('data-runtime-id');
				expect(runtimeId).not.toBeNull();
				const button = view.host.querySelector<HTMLButtonElement>('#updated-capture-action')!;
				const input = view.host.querySelector<HTMLInputElement>('#updated-capture-draft')!;
				input.value = 'native draft';
				input.focus();
				input.setSelectionRange(2, 7);
				const root = view.api.start(view.host, props);
				await root.settle();
				expect(preloaded).toBe(true);
				expect(effects).toEqual([]);
				expect(refs).toEqual([]);
				expect(section.getAttribute('data-probe-id')).toBeNull();
				expect(section.className).toBe('');
				expect(section.style.opacity).toBe('0.5');
				expect(button.hasAttribute('hidden')).toBe(true);
				await root.update({ ...props, identity: 'committed-id', hidden: false, when: load() });
				expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
				expect(view.host.querySelector('#updated-capture-action')).toBe(button);
				expect(view.host.querySelector('#updated-capture-draft')).toBe(input);
				expect(section.getAttribute('data-probe-id')).toBe('committed-id');
				expect(section.getAttribute('data-runtime-id')).toBe(runtimeId);
				expect(section.className).toBe('identified');
				expect(section.style.opacity).toBe('1');
				expect(section.getAttribute('data-initial-id')).toBe('committed-id');
				expect(section.getAttribute('data-initial-visibility')).toBe('visible');
				expect(button.hasAttribute('hidden')).toBe(false);
				expect(effects).toEqual([['mount', 'committed-id', false]]);
				expect(refs).toEqual([button]);
				expect(hydrated).toBe(1);
				expect(input.value).toBe('native draft');
				expect(view.window.document.activeElement).toBe(input);
				expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
				button.click();
				await root.settle();
				expect(clicked).toEqual(['committed-id']);
				expect(button.textContent).toBe('action:1');
				await root.update({ ...props, identity: 'next-id', hidden: true, when: load() });
				expect(section.getAttribute('data-probe-id')).toBe('next-id');
				expect(section.className).toBe('identified');
				expect(section.style.opacity).toBe('0.5');
				expect(section.getAttribute('data-initial-id')).toBe('committed-id');
				expect(section.getAttribute('data-initial-visibility')).toBe('visible');
				expect(button.hasAttribute('hidden')).toBe(true);
				button.click();
				await root.settle();
				expect(clicked).toEqual(['committed-id', 'next-id']);
				expect(button.textContent).toBe('action:2');
				await root.update({ ...props, identity: null, hidden: false, when: load() });
				expect(section.className).toBe('');
				expect(section.style.opacity).toBe('1');
				expect(section.getAttribute('data-initial-id')).toBe('committed-id');
				expect(view.host.querySelector('#updated-capture-action')).toBe(button);
				expect(root.recoverable).toEqual([]);
				root.unmount();
				expect(effects).toEqual([
					['mount', 'committed-id', false],
					['cleanup', 'committed-id', false],
				]);
				expect(view.host.childNodes.length).toBe(0);
				expect(view.diagnostics).toEqual([]);
			} finally {
				view.close();
			}
		});

		it('still diagnoses an initial attribute mismatch after a mounted parent update with identical captures', async () => {
			const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
			const serverProps = { when: condition(false), identity: null, hidden: true };
			const initialClientProps = { ...serverProps, identity: 'initial-client-mismatch' };
			try {
				view.host.innerHTML = renderToString(
					updatedAttributesServer.UpdatedAttributesBoundary,
					serverProps,
				).html;
				const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
				const root = view.api.start(view.host, initialClientProps);
				await root.settle();
				// Keep `when` as well: Controls receives it, so it is a child capture.
				await root.update({ ...initialClientProps });
				expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
				expect(section.getAttribute('data-probe-id')).toBe('initial-client-mismatch');
				expect(root.recoverable).toEqual([]);
				root.unmount();
				if (dev) {
					expect(
						view.diagnostics.some(
							({ level, args }) =>
								level === 'error' && String(args[0]).includes('attribute `data-probe-id`'),
						),
					).toBe(true);
				} else {
					expect(view.diagnostics).toEqual([]);
				}
			} finally {
				view.close();
			}
		});

		for (const split of [true, false]) {
			// Server HTML cannot be compared with captures the client no longer holds
			// without rendering them, so once captures change the repair is silent.
			it(`repairs an attribute without diagnostics once a mounted parent changes ${split ? 'split' : 'unsplit'} captures`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const serverProps = { when: condition(false), identity: null, hidden: true };
				const initialClientProps = { ...serverProps, identity: 'initial-client-mismatch' };
				const View = split
					? updatedAttributesServer.UpdatedAttributesBoundary
					: updatedAttributesServer.UnsplitUpdatedAttributesBoundary;
				try {
					view.host.innerHTML = renderToString(View, serverProps).html;
					const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
					const root = view.api.start(view.host, initialClientProps, split);
					await root.settle();
					await root.update({ ...serverProps, when: load() });
					expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
					expect(section.getAttribute('data-probe-id')).toBeNull();
					expect(root.recoverable).toEqual([]);
					root.unmount();
					expect(view.diagnostics).toEqual([]);
				} finally {
					view.close();
				}
			});
		}

		for (const split of [true, false]) {
			it(`repairs class and style without diagnostics once a mounted parent changes ${split ? 'split' : 'unsplit'} captures`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const serverProps = { when: condition(false), identity: null, hidden: true };
				const initialClientProps = { ...serverProps, identity: 'initial-class', hidden: false };
				const View = split
					? updatedAttributesServer.UpdatedAttributesBoundary
					: updatedAttributesServer.UnsplitUpdatedAttributesBoundary;
				try {
					view.host.innerHTML = renderToString(View, serverProps).html;
					const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
					const root = view.api.start(view.host, initialClientProps, split);
					await root.settle();
					await root.update({ ...serverProps, when: load() });
					expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
					expect(section.className).toBe('');
					expect(section.style.opacity).toBe('0.5');
					expect(root.recoverable).toEqual([]);
					root.unmount();
					expect(view.diagnostics).toEqual([]);
				} finally {
					view.close();
				}
			});
		}

		for (const split of [true, false]) {
			for (const initialSuppressed of [true, false]) {
				it(`repairs a ${split ? 'split' : 'unsplit'} boundary without diagnostics after suppression ${initialSuppressed ? 'is removed' : 'is enabled'} by changed captures`, async () => {
					const view = await consumer<typeof updatedAttributesClient>(
						dev,
						updatedAttributesFilename,
					);
					const serverProps = {
						when: condition(false),
						identity: null,
						hidden: true,
						opacity: 0.5,
					};
					const initialClientProps = {
						...serverProps,
						identity: 'initial-mismatch',
						opacity: 1,
						suppressHydrationWarning: initialSuppressed,
					};
					const View = split
						? updatedAttributesServer.UpdatedAttributesBoundary
						: updatedAttributesServer.UnsplitUpdatedAttributesBoundary;
					try {
						view.host.innerHTML = renderToString(View, serverProps).html;
						const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
						const root = view.api.start(view.host, initialClientProps, split);
						await root.settle();
						await root.update({
							...serverProps,
							suppressHydrationWarning: !initialSuppressed,
							when: load(),
						});
						expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
						expect(section.getAttribute('data-probe-id')).toBeNull();
						expect(section.className).toBe('');
						expect(section.style.opacity).toBe('0.5');
						expect(root.recoverable).toEqual([]);
						root.unmount();
						expect(view.diagnostics).toEqual([]);
					} finally {
						view.close();
					}
				});
			}
		}

		for (const contextOnly of [false, true]) {
			it(`accepts a surrounding ${contextOnly ? 'context-only' : 'context and capture'} update without diagnostics while preserving hydrated IDs`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const serverProps = {
					when: condition(false),
					identity: null,
					hidden: true,
					contextValue: 'server-context',
				};
				const clientProps = serverProps;
				try {
					view.host.innerHTML = renderToString(
						updatedAttributesServer.ContextUpdatedAttributesBoundary,
						serverProps,
					).html;
					const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
					const sibling = view.host.querySelector('#updated-context-sibling')!;
					const runtimeId = section.getAttribute('data-runtime-id');
					const siblingId = sibling.getAttribute('data-runtime-id');
					expect(runtimeId).not.toBeNull();
					expect(siblingId).not.toBeNull();
					expect(runtimeId).not.toBe(siblingId);
					const root = view.api.start(view.host, clientProps, true, false, false, true);
					await root.settle();
					const activationContext = 'latest-context';
					// The context-only case keeps every child capture, including `when`, and
					// activates through the surrounding update itself.
					await root.update(
						contextOnly
							? { ...clientProps, contextValue: activationContext }
							: {
									...clientProps,
									identity: 'committed-id',
									hidden: false,
									contextValue: activationContext,
									when: load(),
								},
					);
					expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
					expect(section.getAttribute('data-runtime-id')).toBe(runtimeId);
					expect(section.getAttribute('data-context')).toBe(activationContext);
					expect(view.host.querySelector('#updated-context-sibling')).toBe(sibling);
					expect(sibling.getAttribute('data-runtime-id')).toBe(siblingId);
					await root.update({
						...clientProps,
						identity: 'next-id',
						hidden: false,
						contextValue: 'next-context',
						when: load(),
					});
					expect(section.getAttribute('data-context')).toBe('next-context');
					expect(section.getAttribute('data-runtime-id')).toBe(runtimeId);
					expect(root.recoverable).toEqual([]);
					root.unmount();
					expect(view.diagnostics).toEqual([]);
				} finally {
					view.close();
				}
			});
		}

		it('keeps unsplit child props and rendering dormant until only its activation condition changes', async () => {
			const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
			const rendered: string[] = [];
			let propertyReads = 0;
			const serverProps = { when: condition(false), observed: { label: 'matching' } };
			const clientProps = {
				when: serverProps.when,
				observed: {
					get label() {
						propertyReads++;
						return 'matching';
					},
				},
				onRender: (label: string) => rendered.push(label),
			};
			try {
				view.host.innerHTML = renderToString(
					updatedAttributesServer.UnsplitObservedCapturesBoundary,
					serverProps,
				).html;
				const child = view.host.querySelector('#unsplit-observed-child')!;
				const root = view.api.startObservedCaptures(view.host, clientProps);
				await root.settle();
				expect(propertyReads).toBe(0);
				expect(rendered).toEqual([]);
				await root.update({ ...clientProps, when: load() });
				expect(view.host.querySelector('#unsplit-observed-child')).toBe(child);
				expect(child.textContent).toBe('matching');
				expect(rendered).toEqual(['matching']);
				expect(propertyReads).toBeGreaterThan(0);
				expect(root.recoverable).toEqual([]);
				root.unmount();
				expect(view.host.querySelector('#unsplit-observed-child')).toBeNull();
				expect(view.diagnostics).toEqual([]);
			} finally {
				view.close();
			}
		});

		it('does not read child-prop getters in an unchosen branch before or after unsplit activation', async () => {
			const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
			let propertyReads = 0;
			const serverProps = {
				when: condition(false),
				guarded: { show: false, hiddenGetter: 'unused' },
			};
			const clientProps = {
				when: serverProps.when,
				guarded: {
					show: false,
					get hiddenGetter() {
						propertyReads++;
						return 'unused';
					},
				},
			};
			try {
				view.host.innerHTML = renderToString(
					updatedAttributesServer.UnsplitGuardedCapturesBoundary,
					serverProps,
				).html;
				const child = view.host.querySelector('#unsplit-guarded-child')!;
				const root = view.api.startGuardedCaptures(view.host, clientProps);
				await root.settle();
				expect(propertyReads).toBe(0);
				await root.update({ ...clientProps, when: load() });
				expect(view.host.querySelector('#unsplit-guarded-child')).toBe(child);
				expect(child.textContent).toBe('Unchosen');
				expect(child.hasAttribute('title')).toBe(false);
				expect(propertyReads).toBe(0);
				expect(root.recoverable).toEqual([]);
				root.unmount();
				expect(view.host.querySelector('#unsplit-guarded-child')).toBeNull();
				expect(view.diagnostics).toEqual([]);
			} finally {
				view.close();
			}
		});

		it('reconciles an unsplit dormant boundary update without attribute mismatch diagnostics', async () => {
			const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
			const props = { when: condition(false), identity: null, hidden: true };
			try {
				view.host.innerHTML = renderToString(
					updatedAttributesServer.UnsplitUpdatedAttributesBoundary,
					props,
				).html;
				const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
				const button = view.host.querySelector('#updated-capture-action')!;
				const root = view.api.start(view.host, props, false);
				await root.settle();
				await root.update({ ...props, identity: 'committed-id', hidden: false, when: load() });
				expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
				expect(view.host.querySelector('#updated-capture-action')).toBe(button);
				expect(section.getAttribute('data-probe-id')).toBe('committed-id');
				expect(button.hasAttribute('hidden')).toBe(false);
				expect(root.recoverable).toEqual([]);
				root.unmount();
				expect(view.diagnostics).toEqual([]);
			} finally {
				view.close();
			}
		});

		for (const split of [true, false]) {
			const boundary = split ? 'split' : 'unsplit';
			const store = { subscribe: () => () => {}, get: () => 'store' };

			it(`activates a ${boundary} boundary updated while dormant without rendering stale captures or reporting its changed text`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const View = split
					? updatedAttributesServer.LoggedBoundary
					: updatedAttributesServer.UnsplitLoggedBoundary;
				const log: string[] = [];
				const props = { when: condition(false), label: 'first', log, store };
				try {
					view.host.innerHTML = renderToString(View, { ...props, log: [] }).html;
					const child = view.host.querySelector<HTMLElement>('#logged-child')!;
					const root = view.api.startLogged(view.host, props, split);
					await root.settle();
					expect(log).toEqual([]);
					await root.update({ ...props, label: 'latest', when: load() });
					expect(view.host.querySelector('#logged-child')).toBe(child);
					expect(child.textContent).toBe('latest');
					expect(child.title).toBe('latest');
					expect(child.dataset.initial).toBe('latest');
					expect(child.dataset.memo).toBe('latest');
					// Dev and prod run user render code with the current captures only.
					expect(log).toContain('render:latest');
					expect(log).toContain('init:latest');
					expect(log.filter((entry) => entry.endsWith(':first'))).toEqual([]);
					expect(root.recoverable).toEqual([]);
					root.unmount();
					expect(view.diagnostics).toEqual([]);
				} finally {
					view.close();
				}
			});
		}

		for (const split of [true, false]) {
			it(`still reports a genuine initial text and attribute mismatch after a mounted parent update with identical ${split ? 'split' : 'unsplit'} captures`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const View = split
					? updatedAttributesServer.LoggedBoundary
					: updatedAttributesServer.UnsplitLoggedBoundary;
				const store = { subscribe: () => () => {}, get: () => 'store' };
				const log: string[] = [];
				const clientProps = { when: condition(false), label: 'client', log, store };
				try {
					view.host.innerHTML = renderToString(View, {
						...clientProps,
						label: 'server',
						log: [],
					}).html;
					const child = view.host.querySelector<HTMLElement>('#logged-child')!;
					const root = view.api.startLogged(view.host, clientProps, split);
					await root.settle();
					// A mounted parent update activates the boundary early, with unchanged captures.
					await root.update({ ...clientProps });
					expect(view.host.querySelector('#logged-child')).toBe(child);
					expect(child.textContent).toBe('client');
					expect(child.title).toBe('client');
					expect(root.recoverable).toHaveLength(1);
					root.unmount();
					if (dev) {
						for (const diagnostic of ['text', 'attribute `title`']) {
							expect(
								view.diagnostics.some(
									({ level, args }) => level === 'error' && String(args[0]).includes(diagnostic),
								),
							).toBe(true);
						}
					} else {
						expect(view.diagnostics).toEqual([]);
					}
				} finally {
					view.close();
				}
			});
		}

		for (const initialMismatch of [false, true]) {
			it(`${initialMismatch ? 'repairs an initial client mismatch' : 'accepts mounted parent updates'} without diagnostics when nested dormant boundaries activate separately`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const effects: [string, string | null, boolean][] = [];
				const refs: (HTMLButtonElement | null)[] = [];
				const serverProps = {
					when: condition(false),
					innerWhen: condition(false),
					identity: null,
					hidden: true,
					onEffect: (phase: 'mount' | 'cleanup', identity: string | null, hidden: boolean) =>
						effects.push([phase, identity, hidden]),
					onRef: (node: HTMLButtonElement | null) => refs.push(node),
				};
				const clientProps = {
					...serverProps,
					identity: initialMismatch ? 'initial-mismatch' : null,
				};
				try {
					view.host.innerHTML = renderToString(
						updatedAttributesServer.NestedUpdatedAttributesBoundary,
						serverProps,
					).html;
					const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
					const button = view.host.querySelector('#updated-capture-action')!;
					const root = view.api.start(view.host, clientProps, true, true);
					await root.settle();
					const outerProps = {
						...clientProps,
						identity: 'outer-committed',
						hidden: false,
						when: load(),
					};
					await root.update(outerProps);
					expect(effects).toEqual([]);
					expect(refs).toEqual([]);
					expect(section.getAttribute('data-probe-id')).toBeNull();
					// Identical inner captures: the parent update alone activates the inner
					// boundary, whose server HTML predates the outer boundary's new captures.
					await root.update({ ...outerProps });
					expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
					expect(view.host.querySelector('#updated-capture-action')).toBe(button);
					expect(section.getAttribute('data-probe-id')).toBe('outer-committed');
					expect(section.getAttribute('data-initial-id')).toBe('outer-committed');
					expect(section.getAttribute('data-initial-visibility')).toBe('visible');
					expect(button.hasAttribute('hidden')).toBe(false);
					expect(effects).toEqual([['mount', 'outer-committed', false]]);
					expect(refs).toEqual([button]);
					expect(root.recoverable).toEqual([]);
					root.unmount();
					expect(refs).toEqual([button, null]);
					expect(effects).toEqual([
						['mount', 'outer-committed', false],
						['cleanup', 'outer-committed', false],
					]);
					// The inner boundary is claimed while its enclosing boundary activates
					// with changed captures, so it inherits the stale server values.
					expect(view.diagnostics).toEqual([]);
				} finally {
					view.close();
				}
			});
		}

		it('keeps dormant portal captures and stylesheet resources from publishing historical values', async () => {
			const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
			const portalTarget = view.window.document.createElement('aside');
			portalTarget.innerHTML = '<span id="foreign-kept">foreign content</span>';
			view.window.document.body.appendChild(portalTarget);
			const foreignNode = portalTarget.firstElementChild;
			const effects: [string, string | null, boolean][] = [];
			const refs: (HTMLButtonElement | null)[] = [];
			const clicked: (string | null)[] = [];
			const serverProps = {
				when: condition(false),
				identity: null,
				hidden: true,
				portalTarget: portalTarget as unknown as HTMLElement,
				stylesheetIdentity: 'server-resource',
				onEffect: (phase: 'mount' | 'cleanup', identity: string | null, hidden: boolean) =>
					effects.push([phase, identity, hidden]),
				onRef: (node: HTMLButtonElement | null) => refs.push(node),
				onClick: (identity: string | null) => clicked.push(identity),
			};
			try {
				const rendered = renderToString(
					updatedAttributesServer.ForeignEffectsUpdatedAttributesBoundary,
					serverProps,
					{ headChannel: 'separate' },
				);
				view.window.document.head.innerHTML = rendered.head ?? '';
				view.host.innerHTML = rendered.html;
				const section = view.host.querySelector<HTMLElement>('#updated-capture-controls')!;
				const button = view.host.querySelector('#updated-capture-action')!;
				const initialProps = { ...serverProps, stylesheetIdentity: 'dormant-resource' };
				const root = view.api.start(view.host, initialProps, true, false, true);
				await root.settle();
				expect(portalTarget.querySelector('#updated-capture-portal-action')).toBeNull();
				expect(effects).toEqual([]);
				expect(refs).toEqual([]);
				await root.update({
					...initialProps,
					identity: 'committed-id',
					hidden: false,
					stylesheetIdentity: 'current-resource',
					when: load(),
				});
				expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
				expect(section.getAttribute('data-probe-id')).toBe('committed-id');
				expect(button.hasAttribute('hidden')).toBe(false);
				expect(effects).toEqual([['mount', 'committed-id', false]]);
				expect(refs).toEqual([button]);
				expect(portalTarget.querySelector('#foreign-kept')).toBe(foreignNode);
				const portalButton = portalTarget.querySelector(
					'#updated-capture-portal-action',
				) as unknown as HTMLButtonElement;
				expect(portalButton.getAttribute('data-probe-id')).toBe('committed-id');
				expect(portalButton.textContent).toBe('portal:committed-id');
				portalButton.click();
				await root.settle();
				expect(clicked).toEqual(['committed-id']);
				expect(
					view.window.document.head.querySelector('style[data-href="dormant-resource"]'),
				).toBeNull();
				const currentResource = view.window.document.head.querySelector(
					'style[data-href="current-resource"]',
				);
				expect(currentResource).not.toBeNull();
				expect(root.recoverable).toEqual([]);
				root.unmount();
				expect(refs).toEqual([button, null]);
				expect(effects).toEqual([
					['mount', 'committed-id', false],
					['cleanup', 'committed-id', false],
				]);
				expect(portalTarget.querySelector('#updated-capture-portal-action')).toBeNull();
				expect(portalTarget.querySelector('#foreign-kept')).toBe(foreignNode);
				expect(view.window.document.head.querySelector('style[data-href="current-resource"]')).toBe(
					currentResource,
				);
				expect(
					view.window.document.head.querySelector('style[data-href="dormant-resource"]'),
				).toBeNull();
				expect(view.diagnostics).toEqual([]);
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
