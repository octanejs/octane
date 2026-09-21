import { describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import {
	bootstrapIndependentHydration,
	type IndependentHydrateActivationContext,
} from '../../src/hydration/independent-island.js';
import { renderToString } from '../../src/runtime.server.js';
import { createScope } from 'octane/signals';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';
import {
	createIndependentHydrateManifest,
	serializeIndependentHydrateManifest,
	type IndependentHydrateManifestTemplate,
} from '../../src/independent-hydration-protocol.js';

function template(boundaryId: string): IndependentHydrateManifestTemplate {
	return {
		version: 1,
		boundaryId,
		exportName: 'default',
		captureSchema: [{ name: 'label', type: 'json' }],
		hookSeed: 2,
		idSeed: 3,
		signalSites: ['g:label'],
		parentDependencies: false,
	};
}

function island(templateId: string, instanceId: string, moduleId: string, label: string): Element {
	const wrapper = document.createElement('div');
	wrapper.setAttribute('data-octane-hydrate-id', instanceId);
	wrapper.setAttribute('data-octane-hydrate-when', 'interaction');
	wrapper.setAttribute('data-octane-hydrate-independent', '');
	const button = document.createElement('button');
	button.textContent = label;
	const sidecar = document.createElement('script');
	sidecar.type = 'application/json';
	sidecar.setAttribute('data-octane-independent', '');
	sidecar.textContent = serializeIndependentHydrateManifest(
		createIndependentHydrateManifest(template(templateId), [label], instanceId, 'build-1', {
			moduleId,
			styles: [`${moduleId}.css`],
		}),
	);
	wrapper.append(button, sidecar);
	return wrapper;
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('independent hydration bootstrap', () => {
	it.each(
		[false, true].flatMap((dev) =>
			['ready', 'pending', 'removed'].map((primary) => ({ dev, primary })),
		),
	)('replays commands after the controlled primary commits (%j)', async ({ dev, primary }) => {
		const source = `import { Hydrate, useLayoutEffect } from 'octane';
import { interaction } from 'octane/hydration';
import { draft$, send, wait, layout } from './actions';
export function App() @{
  <Hydrate independent when={interaction({ events: 'click' })}>
    <Content />
  </Hydrate>
}
function Content() @{
  wait();
  useLayoutEffect(layout, []);
    <section>
      <textarea data-draft value={draft$} />
      <button type="button" onClick={send}>Send</button>
      <output>{draft$}</output>
    </section>
}`;
		const file = '/project/src/ControlledWidget.tsrx';
		const scope = createScope({ scopeKey: 'controlled-widget-' + dev + '-' + primary });
		const draft$ = scope.signal$('draft', '');
		const sent: string[] = [];
		const sentAfterLayout: boolean[] = [];
		let committed = false;
		let waiting = primary !== 'ready';
		let waitStarted = false;
		let resume!: () => void;
		const ready = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const actions = {
			draft$,
			wait() {},
			layout() {
				committed = true;
			},
			send() {
				sent.push(scope.get(draft$));
				sentAfterLayout.push(committed);
				scope.set(draft$, '');
			},
		};
		const server = evaluateCompiledFixtureCode(
			compile(source, file, { mode: 'server', dev }).code,
			file,
			'server',
			{ './actions': actions },
		);
		const widget = evaluateCompiledFixtureCode(
			compile(source, file + '?octane-hydrate=0', { mode: 'client', dev }).code,
			file,
			'client',
			{
				'./actions': {
					...actions,
					wait() {
						waitStarted = true;
						if (waiting) throw ready;
					},
				},
			},
		);
		const host = document.createElement('main');
		host.innerHTML = renderToString(server.App, undefined, {
			signalOwner: scope,
			independentHydration: {
				buildId: 'controlled-widget-build',
				resolve: (moduleId) => ({ moduleId, styles: [] }),
			},
		}).html;
		document.body.append(host);
		let release!: () => void;
		const loaded = new Promise<void>((resolve) => {
			release = resolve;
		});
		const errors: unknown[] = [];
		const cleanup = bootstrapIndependentHydration(host, {
			buildId: 'controlled-widget-build',
			signalOwner: scope,
			loadStyles() {},
			async loadModule() {
				await loaded;
				return widget;
			},
			onError: (error) => errors.push(error),
		});
		try {
			const input = host.querySelector('textarea')!;
			input.value = 'entered before activation';
			scope.set(draft$, input.value);
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			host.querySelector('button')!.click();
			release();
			await vi.waitFor(() => expect(waitStarted).toBe(true));
			if (primary !== 'ready') {
				expect(sent).toEqual([]);
				expect(committed).toBe(false);
				if (primary === 'removed') cleanup();
				waiting = false;
				resume();
				if (primary === 'removed') {
					await settle();
					expect(sent).toEqual([]);
					expect(committed).toBe(false);
					expect(errors).toEqual([]);
					return;
				}
			}
			await vi.waitFor(() => expect(sent).toEqual(['entered before activation']));
			await settle();
			expect(scope.get(draft$)).toBe('');
			expect(input.value).toBe('');
			expect(host.querySelector('textarea')).toBe(input);
			expect(host.querySelector('output')!.textContent).toBe('');
			expect(sentAfterLayout).toEqual([true]);
			expect(errors).toEqual([]);
		} finally {
			cleanup();
			scope.dispose();
			host.remove();
		}
	});

	it.each(
		[false, true].flatMap((dev) =>
			['template', 'tsx', 'return-tsrx'].map((authoring) => ({ dev, authoring })),
		),
	)(
		'activates a load widget without running its parent or loading an interaction sibling (%j)',
		async ({ dev, authoring }) => {
			const children = `<main>
  <Hydrate independent when={load()} children={renderChildren()}>
    <input data-draft defaultValue="server" />
    <button type="button" data-load onClick={() => choose('load')}>{readLabel(__octaneIndependentProps) as string}</button>
    <Hydrate independent when={interaction({ events: 'click' })}>
      <input data-nested-draft defaultValue="nested server" />
      <button type="button" data-nested onClick={() => choose('nested')}>Nested widget</button>
    </Hydrate>
  </Hydrate>
  <Hydrate independent when={interaction({ events: 'click' })}>
    <button type="button" data-interaction onClick={() => choose('interaction')}>Dormant widget</button>
  </Hydrate>
</main>`;
			const source = `import { Hydrate } from 'octane';
import { interaction, load } from 'octane/hydration';
import { choose, readLabel, renderChildren, renderShell } from './actions';
${authoring === 'template' ? `export function App() @{ renderShell(); const __octaneIndependentProps = 'Loaded widget'; ${children} }` : `export function App() { renderShell(); const __octaneIndependentProps = 'Loaded widget'; return ${children}; }`}
function Unrelated() {
  let __octaneIndependentProps = readLabel('unrelated');
  __octaneIndependentProps = 'unused';
  return null;
}`;
			const file = `/project/src/LoadWidget.${authoring === 'tsx' ? 'tsx' : 'tsrx'}`;
			const observations: string[] = [];
			const server = evaluateCompiledFixtureCode(
				compile(source, file, { mode: 'server', dev }).code,
				file,
				'server',
				{
					'./actions': {
						choose() {},
						renderShell() {
							observations.push('shell');
						},
						renderChildren() {
							observations.push('overwritten children');
							return null;
						},
						readLabel(label: string) {
							observations.push(label);
							return label;
						},
					},
				},
			);
			const choose = vi.fn();
			const compileWidget = (path: string) =>
				evaluateCompiledFixtureCode(
					compile(source, file + '?octane-hydrate=' + path, { mode: 'client', dev }).code,
					file,
					'client',
					{
						'./actions': {
							choose,
							readLabel: (label: string) => label,
							renderShell() {
								throw new Error('The widget must not run its lexical parent.');
							},
						},
					},
				);
			const widget = compileWidget('0');
			const nestedWidget = compileWidget('0.0');
			const host = document.createElement('div');
			host.innerHTML = renderToString(server.App, undefined, {
				independentHydration: {
					buildId: 'load-widget-test',
					resolve: (boundaryId) => ({
						moduleId: boundaryId,
						styles: [],
					}),
				},
			}).html;
			expect(observations).toEqual(['shell', 'overwritten children', 'Loaded widget']);
			document.body.append(host);
			const button = host.querySelector<HTMLButtonElement>('[data-load]')!;
			const input = host.querySelector<HTMLInputElement>('[data-draft]')!;
			input.value = 'edited before activation';
			const nestedButton = host.querySelector<HTMLButtonElement>('[data-nested]')!;
			const nestedInput = host.querySelector<HTMLInputElement>('[data-nested-draft]')!;
			nestedInput.value = 'nested edit before activation';
			const sibling = host.querySelector<HTMLButtonElement>('[data-interaction]')!;
			const loadManifest = JSON.parse(
				button.parentElement!.querySelector(':scope > script[data-octane-independent]')!
					.textContent!,
			);
			const nestedManifest = JSON.parse(
				nestedButton.parentElement!.querySelector('script[data-octane-independent]')!.textContent!,
			);
			const errors: unknown[] = [];
			let active = false;
			let nestedActive = false;
			const modules: string[] = [];
			const cleanup = bootstrapIndependentHydration(host, {
				buildId: 'load-widget-test',
				loadStyles() {},
				async loadModule(moduleId) {
					modules.push(moduleId);
					return {
						default(context: IndependentHydrateActivationContext) {
							const nested = moduleId === nestedManifest.moduleId;
							const root = (nested ? nestedWidget : widget).default(context);
							if (nested) nestedActive = true;
							else active = true;
							return root;
						},
					};
				},
				onError: (error) => errors.push(error),
			});
			try {
				await vi.waitFor(() => expect(active).toBe(true));
				expect(host.querySelector('[data-load]')).toBe(button);
				expect(host.querySelector('[data-draft]')).toBe(input);
				expect(input.value).toBe('edited before activation');
				expect(button.textContent).toBe('Loaded widget');
				expect(host.querySelector('[data-nested]')).toBe(nestedButton);
				expect(host.querySelector('[data-nested-draft]')).toBe(nestedInput);
				expect(nestedInput.value).toBe('nested edit before activation');
				expect(host.querySelector('[data-interaction]')).toBe(sibling);
				expect(modules).toEqual([loadManifest.moduleId]);
				button.click();
				expect(choose.mock.calls).toEqual([['load']]);
				nestedButton.click();
				await vi.waitFor(() => expect(nestedActive).toBe(true));
				expect(modules).toEqual([loadManifest.moduleId, nestedManifest.moduleId]);
				expect(choose.mock.calls).toEqual([['load'], ['nested']]);
				expect(host.querySelector('[data-nested]')).toBe(nestedButton);
				expect(host.querySelector('[data-nested-draft]')).toBe(nestedInput);
				expect(nestedInput.value).toBe('nested edit before activation');
				expect(errors).toEqual([]);
			} finally {
				cleanup();
				host.remove();
			}
		},
	);

	it('resumes an automatically loading widget after pausing its pending stylesheet', async () => {
		const host = document.createElement('main');
		const widget = island('widget', 'paused-load', 'widget.js', 'Waiting');
		widget.setAttribute('data-octane-hydrate-when', 'load');
		host.append(widget);
		document.body.append(host);
		let release!: () => void;
		const styles = new Promise<void>((resolve) => {
			release = resolve;
		});
		let stylesStarted = false;
		const modules: string[] = [];
		const cleanup = bootstrapIndependentHydration(host, {
			loadStyles() {
				stylesStarted = true;
				return styles;
			},
			async loadModule(moduleId) {
				modules.push(moduleId);
				return {
					default() {
						widget.querySelector('button')!.textContent = 'Ready';
					},
				};
			},
		});
		try {
			await vi.waitFor(() => expect(stylesStarted).toBe(true));
			cleanup.pause();
			release();
			await settle();
			expect(modules).toEqual([]);
			expect(widget.querySelector('button')!.textContent).toBe('Waiting');
			cleanup.resume();
			await vi.waitFor(() => expect(widget.querySelector('button')!.textContent).toBe('Ready'));
			expect(modules).toEqual(['widget.js']);
		} finally {
			release();
			cleanup();
			host.remove();
		}
	});

	it.each(['removed', 'disposed'])(
		'does not import an automatically loading widget retired while styles are pending (%s)',
		async (retirement) => {
			const host = document.createElement('main');
			const widget = island('widget', `retired-load-${retirement}`, 'widget.js', 'Waiting');
			widget.setAttribute('data-octane-hydrate-when', 'load');
			host.append(widget);
			document.body.append(host);
			let release!: () => void;
			const styles = new Promise<void>((resolve) => {
				release = resolve;
			});
			let stylesStarted = false;
			const modules: string[] = [];
			const cleanup = bootstrapIndependentHydration(host, {
				loadStyles() {
					stylesStarted = true;
					return styles;
				},
				async loadModule(moduleId) {
					modules.push(moduleId);
					return { default() {} };
				},
			});
			try {
				await vi.waitFor(() => expect(stylesStarted).toBe(true));
				if (retirement === 'removed') widget.remove();
				else cleanup();
				await settle();
				release();
				await settle();
				expect(modules).toEqual([]);
			} finally {
				release();
				cleanup();
				host.remove();
			}
		},
	);

	it('rejects a different build before loading styles or activating its HTML', async () => {
		const host = document.createElement('main');
		const widget = island('widget', 'foreign-build', 'widget.js', 'Original');
		host.append(widget);
		document.body.append(host);
		const load = vi.fn(async () => ({ default() {} }));
		const styles = vi.fn();
		const errors: unknown[] = [];
		const clean = bootstrapIndependentHydration(host, {
			buildId: 'another-build',
			loadStyles: styles,
			loadModule: load,
			onError: (error) => errors.push(error),
		});
		try {
			widget.querySelector('button')!.click();
			await settle();
			expect(errors.map(String)).toContain('Error: Independent Hydrate build identity mismatch.');
			expect(load).not.toHaveBeenCalled();
			expect(styles).not.toHaveBeenCalled();
			expect(widget.querySelector('button')!.textContent).toBe('Original');
		} finally {
			clean();
			host.remove();
		}
	});

	it('honors an authored click-only strategy instead of activating on unrelated pointer events', async () => {
		const host = document.createElement('main');
		const first = island('widget', 'click-only', 'widget.js', 'Start');
		first.setAttribute('data-octane-hydrate-interaction-events', 'click');
		host.append(first);
		document.body.append(host);
		const modules: string[] = [];
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			async loadModule(id) {
				modules.push(id);
				return { default() {} };
			},
		});
		try {
			first
				.querySelector('button')!
				.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
			await settle();
			expect(modules).toEqual([]);
			first.querySelector('button')!.click();
			await vi.waitFor(() => expect(modules).toEqual(['widget.js']));
		} finally {
			clean();
			host.remove();
		}
	});

	it.each([false, true])(
		'routes a nested independent click without evaluating its parent (late metadata: %s)',
		async (late) => {
			const host = document.createElement('main');
			const parent = island('parent', `parent-${late}`, 'parent.js', 'Parent');
			const child = island('child', `child-${late}`, 'child.js', 'Child');
			const sidecar = child.querySelector('script')!;
			if (late) sidecar.remove();
			parent.append(child);
			host.append(parent);
			document.body.append(host);
			const modules: string[] = [];
			const clean = bootstrapIndependentHydration(host, {
				loadStyles() {},
				async loadModule(id) {
					modules.push(id);
					return {
						default({
							element,
							intents,
						}: {
							element: Element;
							intents: readonly { event: Event }[];
						}) {
							element.querySelector('button')!.textContent = intents
								.map(({ event }) => event.type)
								.join(',');
						},
					};
				},
			});
			try {
				child.querySelector('button')!.click();
				if (late) child.append(sidecar);
				await vi.waitFor(() => expect(child.querySelector('button')!.textContent).toBe('click'), {
					timeout: 150,
				});
				expect(modules).toEqual(['child.js']);
				expect(parent.firstElementChild!.textContent).toBe('Parent');
			} finally {
				clean();
				host.remove();
			}
		},
	);

	it('activates a later-streamed widget without loading its independent sibling', async () => {
		const host = document.createElement('main');
		document.body.append(host);
		const loads: string[] = [];
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			async loadModule(moduleId) {
				loads.push(moduleId);
				return {
					default({ element }: { element: Element }) {
						element.querySelector('button')!.textContent = 'Active';
					},
				};
			},
		});
		try {
			const first = island('widget-a', 'late-a', 'a.js', 'Alpha');
			const second = island('widget-b', 'late-b', 'b.js', 'Beta');
			host.append(first, second);
			await settle();
			first.querySelector('button')!.click();
			await vi.waitFor(() => expect(first.querySelector('button')!.textContent).toBe('Active'), {
				timeout: 150,
			});
			expect(loads).toEqual(['a.js']);
			expect(second.querySelector('button')!.textContent).toBe('Beta');
		} finally {
			clean();
			host.remove();
		}
	});

	it('uses the click recorded before the streamed sidecar arrives without requiring another click', async () => {
		const host = document.createElement('main');
		document.body.append(host);
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			async loadModule() {
				return {
					default({
						element,
						intents,
					}: {
						element: Element;
						intents: readonly { event: Event }[];
					}) {
						element.querySelector('button')!.textContent = intents
							.map(({ event }) => event.type)
							.join(',');
					},
				};
			},
		});
		try {
			const first = island('widget', 'early-click', 'widget.js', 'Start');
			const sidecar = first.querySelector('script')!;
			sidecar.remove();
			host.append(first);
			first.querySelector('button')!.click();
			first.append(sidecar);
			await vi.waitFor(() => expect(first.querySelector('button')!.textContent).toBe('click'), {
				timeout: 150,
			});
		} finally {
			clean();
			host.remove();
		}
	});

	it('retires a removed island and does not activate it when an outstanding module load finishes', async () => {
		const host = document.createElement('main');
		const first = island('widget', 'removed-before-load', 'widget.js', 'Start');
		host.append(first);
		document.body.append(host);
		let release!: (module: Record<string, unknown>) => void;
		const module = new Promise<Record<string, unknown>>((resolve) => {
			release = resolve;
		});
		let loading = false;
		let activated = false;
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			loadModule() {
				loading = true;
				return module;
			},
		});
		try {
			first.querySelector('button')!.click();
			await vi.waitFor(() => expect(loading).toBe(true));
			first.remove();
			await settle();
			release({
				default() {
					activated = true;
				},
			});
			await settle();
			expect(activated).toBe(false);
		} finally {
			release({});
			clean();
			host.remove();
		}
	});

	it('unmounts an activated island when its boundary leaves the bootstrap scope', async () => {
		const host = document.createElement('main');
		const first = island('widget', 'removed-after-load', 'widget.js', 'Start');
		host.append(first);
		document.body.append(host);
		let mounted = false;
		let cleanups = 0;
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			async loadModule() {
				return {
					default() {
						mounted = true;
						return {
							unmount() {
								cleanups++;
								mounted = false;
							},
						};
					},
				};
			},
		});
		try {
			first.querySelector('button')!.click();
			await vi.waitFor(() => expect(mounted).toBe(true));
			first.remove();
			await vi.waitFor(() => expect(mounted).toBe(false), { timeout: 150 });
			clean();
			expect(cleanups).toBe(1);
		} finally {
			clean();
			host.remove();
		}
	});

	it('does not import a retired widget when its pending stylesheet finishes', async () => {
		const host = document.createElement('main');
		const first = island('widget', 'removed-before-styles', 'widget.js', 'Start');
		host.append(first);
		document.body.append(host);
		let release!: () => void;
		const styles = new Promise<void>((resolve) => {
			release = resolve;
		});
		const modules: string[] = [];
		const clean = bootstrapIndependentHydration(host, {
			loadStyles: () => styles,
			async loadModule(id) {
				modules.push(id);
				return { default() {} };
			},
		});
		try {
			first.querySelector('button')!.click();
			await settle();
			first.remove();
			await settle();
			release();
			await settle();
			expect(modules).toEqual([]);
		} finally {
			release();
			clean();
			host.remove();
		}
	});

	it('preserves an active widget moved within the scope and stops watching after cleanup', async () => {
		const host = document.createElement('main');
		const destination = document.createElement('section');
		const first = island('widget', 'move-within-scope', 'widget.js', 'Start');
		host.append(first, destination);
		document.body.append(host);
		let mounted = false;
		const modules: string[] = [];
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			async loadModule(id) {
				modules.push(id);
				return {
					default() {
						mounted = true;
						return {
							unmount() {
								mounted = false;
							},
						};
					},
				};
			},
		});
		try {
			first.querySelector('button')!.click();
			await vi.waitFor(() => expect(mounted).toBe(true));
			destination.append(first);
			await settle();
			expect(mounted).toBe(true);
			expect(modules).toEqual(['widget.js']);
			clean();
			expect(mounted).toBe(false);
			const late = island('late', 'after-cleanup', 'late.js', 'Late');
			destination.append(late);
			await settle();
			late.querySelector('button')!.click();
			await settle();
			expect(modules).toEqual(['widget.js']);
		} finally {
			clean();
			host.remove();
		}
	});

	it('waits for a streamed sidecar body while retaining all discrete early clicks', async () => {
		const host = document.createElement('main');
		document.body.append(host);
		const errors: unknown[] = [];
		const clean = bootstrapIndependentHydration(host, {
			loadStyles() {},
			onError(error) {
				errors.push(error);
			},
			async loadModule() {
				return {
					default({
						element,
						intents,
					}: {
						element: Element;
						intents: readonly { event: Event }[];
					}) {
						element.querySelector('button')!.textContent = intents
							.map(({ event }) => event.type)
							.join(',');
					},
				};
			},
		});
		try {
			const first = island('widget', 'later-sidecar-body', 'widget.js', 'Start');
			const sidecar = first.querySelector('script')!;
			const manifest = sidecar.textContent;
			sidecar.textContent = '';
			host.append(first);
			await settle();
			first.querySelector('button')!.click();
			first.querySelector('button')!.click();
			first.querySelector('button')!.click();
			sidecar.textContent = manifest;
			await vi.waitFor(() =>
				expect(first.querySelector('button')!.textContent).toBe('click,click,click'),
			);
			expect(errors).toEqual([]);
		} finally {
			clean();
			host.remove();
		}
	});

	it('loads styles then only the interacted module and passes decoded captures', async () => {
		const first = island('widget-a', 'instance-a', 'a.js', 'Alpha');
		const second = island('widget-b', 'instance-b', 'b.js', 'Beta');
		document.body.append(first, second);
		const order: string[] = [];
		let clicks = 0;
		first.querySelector('button')!.addEventListener('click', () => clicks++);
		const clean = bootstrapIndependentHydration(document, {
			async loadStyles(styles) {
				order.push(`styles:${styles.join(',')}`);
			},
			async loadModule(moduleId) {
				order.push(`module:${moduleId}`);
				return {
					default(context: {
						captures: readonly unknown[];
						intents: ReadonlyArray<{ event: Event }>;
					}) {
						const before = context.intents.length;
						const button = first.querySelector('button')!;
						button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
						for (const intent of context.intents) {
							button.dispatchEvent(
								new MouseEvent(intent.event.type, { bubbles: true, composed: true }),
							);
						}
						order.push(`activate:${context.captures[0]}:${before}:${context.intents.length}`);
					},
				};
			},
		});

		expect(order).toEqual([]);
		first
			.querySelector('button')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
		await settle();
		expect(order).toEqual(['styles:a.js.css', 'module:a.js', 'activate:Alpha:1:1']);
		expect(clicks).toBe(2);
		expect(order).not.toContain('module:b.js');

		clean();
		first.remove();
		second.remove();
	});

	it('escapes inert sidecar delimiters without losing capture data', () => {
		const manifest = createIndependentHydrateManifest(
			template('widget'),
			['</script><!--&'],
			'instance',
			'build',
			{ moduleId: 'widget.js', styles: [] },
		);
		const serialized = serializeIndependentHydrateManifest(manifest);
		expect(serialized).not.toContain('</script>');
		expect(serialized).not.toContain('<!--');
		expect(JSON.parse(serialized)).toEqual(manifest);
	});
});
