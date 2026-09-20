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

const filename = resolve(import.meta.dirname, '_fixtures/split-template-lifecycle.tsrx');
const server = loadServerFixture<typeof client>(filename);
const updatedAttributesFilename = resolve(
	import.meta.dirname,
	'_fixtures/split-hydrate-updated-attributes.tsrx',
);
const updatedAttributesServer =
	loadServerFixture<typeof updatedAttributesClient>(updatedAttributesFilename);

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

		it('still diagnoses an initial attribute mismatch after an unrelated mounted parent update', async () => {
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
				await root.update({ ...initialClientProps, hidden: false, when: load() });
				expect(view.host.querySelector('#updated-capture-controls')).toBe(section);
				expect(section.getAttribute('data-probe-id')).toBe('initial-client-mismatch');
				expect(view.host.querySelector('#updated-capture-action')!.hasAttribute('hidden')).toBe(
					false,
				);
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
			it(`diagnoses an initial attribute mismatch even after it is corrected in a ${split ? 'split' : 'unsplit'} boundary`, async () => {
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
		}

		for (const split of [true, false]) {
			it(`diagnoses initial class and style mismatches corrected before a ${split ? 'split' : 'unsplit'} boundary activates`, async () => {
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
					if (dev) {
						expect(
							view.diagnostics.some(
								({ level, args }) =>
									level === 'error' && String(args[0]).includes('attribute `class`'),
							),
						).toBe(true);
						expect(
							view.diagnostics.some(
								({ level, args }) =>
									level === 'error' && String(args[0]).includes('server rendered style'),
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

		for (const split of [true, false]) {
			for (const initialSuppressed of [true, false]) {
				it(`uses initial suppression for attribute, class and style diagnostics in a ${split ? 'split' : 'unsplit'} boundary after suppression ${initialSuppressed ? 'is removed' : 'is enabled'}`, async () => {
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
						if (dev && !initialSuppressed) {
							for (const diagnostic of [
								'attribute `data-probe-id`',
								'attribute `class`',
								'server rendered style',
							]) {
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
		}

		for (const initialMismatch of [false, true]) {
			it(`${initialMismatch ? 'diagnoses the initial context mismatch' : 'accepts a surrounding context update'} while preserving hydrated IDs`, async () => {
				const view = await consumer<typeof updatedAttributesClient>(dev, updatedAttributesFilename);
				const serverProps = {
					when: condition(false),
					identity: null,
					hidden: true,
					contextValue: 'server-context',
				};
				const clientProps = {
					...serverProps,
					contextValue: initialMismatch ? 'initial-client-context' : 'server-context',
				};
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
					const activationContext = initialMismatch ? 'server-context' : 'latest-context';
					await root.update({
						...clientProps,
						identity: 'committed-id',
						hidden: false,
						contextValue: activationContext,
						when: load(),
					});
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
					if (dev && initialMismatch) {
						expect(
							view.diagnostics.some(
								({ level, args }) =>
									level === 'error' &&
									String(args[0]).includes('attribute `data-context`') &&
									String(args[0]).includes('initial-client-context'),
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

		for (const initialMismatch of [false, true]) {
			it(`${initialMismatch ? 'diagnoses the initial client mismatch' : 'accepts mounted parent updates'} when nested dormant boundaries activate separately`, async () => {
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
					await root.update({ ...outerProps, innerWhen: load() });
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
					if (dev && initialMismatch) {
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
