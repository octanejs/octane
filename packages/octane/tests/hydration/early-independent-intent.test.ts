import { describe, expect, it, vi } from 'vitest';
import * as server from '../../src/server/index.js';
import {
	enableServerSignalBindings,
	renderToReadableStream,
	renderToString,
} from '../../src/runtime.server.js';
import { __queryAt } from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	bootstrapIndependentHydration,
	registerIndependentHydrationIsland,
} from '../../src/hydration/independent-island.js';
import {
	createIndependentHydrateManifest,
	serializeIndependentHydrateManifest,
} from '../../src/independent-hydration-protocol.js';
import {
	initializeIndependentHydrationEventCapture,
	takePendingHydrationIntents,
} from '../../src/hydration/event-capture.js';

let bootstrap: Promise<string> | undefined;
function emittedBootstrap(): Promise<string> {
	return (bootstrap ??= (async () => {
		enableServerSignalBindings();
		const query$ = __queryAt(
			'g:early-intent-bootstrap',
			'early-intent-bootstrap',
			() => 'key',
			async () => 'ready',
		);
		const stream = await renderToReadableStream(
			() => {
				query$.snapshot();
				return '<p>Shell</p>';
			},
			undefined,
			{
				streamedSignals: { buildId: 'intent-build', documentId: 'intent-document' },
				independentHydration: {
					buildId: 'intent-build',
					resolve() {
						return undefined;
					},
				},
			},
		);
		const html = await new Response(stream).text();
		const script = html.match(
			/<script[^>]*>(\(function\(g\)\{var z="__octaneStreamedSignalSelections"[\s\S]*?)<\/script>/,
		)?.[1];
		expect(script).toBeDefined();
		return script!;
	})());
}

async function earlyDocument(): Promise<Document> {
	const ownerDocument = document.implementation.createHTMLDocument('Early intent');
	// Execute the actual public renderer's inline script before installing the
	// imported capture module for this fresh document. No compiler/runtime stub.
	new Function('document', 'globalThis', await emittedBootstrap())(ownerDocument, {});
	return ownerDocument;
}

function boundary(ownerDocument: Document, id: string): Element {
	const element = ownerDocument.createElement('div');
	element.setAttribute('data-octane-hydrate-id', id);
	element.setAttribute('data-octane-hydrate-when', 'interaction');
	element.setAttribute('data-octane-hydrate-independent', '');
	element.innerHTML = '<button>One</button><button>Two</button><a href="/forecast">Forecast</a>';
	ownerDocument.body.append(element);
	return element;
}

function click(target: Element): MouseEvent {
	const event = new MouseEvent('click', { bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

function selections(widget: Element): NodeListOf<HTMLButtonElement> {
	widget.setAttribute('data-octane-hydrate-interaction-events', 'click');
	widget.innerHTML =
		'<button type="button" data-octane-hydrate-selection="day">Monday</button>' +
		'<button type="button" data-octane-hydrate-selection="day"><span>Tuesday</span></button>' +
		'<button type="button">Send</button>';
	return widget.querySelectorAll('button');
}

function widgetManifest(id: string) {
	return createIndependentHydrateManifest(
		{
			version: 1,
			boundaryId: 'widget-template',
			exportName: 'default',
			captureSchema: [],
			hookSeed: 0,
			idSeed: 0,
			signalSites: [],
			parentDependencies: false,
		},
		[],
		id,
		'intent-build',
		{ moduleId: 'widget.js', styles: [] },
	);
}

function expectEvents(actual: readonly Event[] | undefined, expected: readonly Event[]): void {
	expect(actual).toHaveLength(expected.length);
	for (let index = 0; index < expected.length; index++)
		expect(actual![index]).toBe(expected[index]);
}

describe('public pre-module independent intent capture', () => {
	it.each(
		[false, true].flatMap((dev) => [false, true].map((changeGroup) => ({ dev, changeGroup }))),
	)(
		'applies compiled selections and sends in order before the parent loads (%j)',
		async ({ dev, changeGroup }) => {
			const source = `import { Hydrate } from 'octane';
import { interaction } from 'octane/hydration';
import { choose, send } from './actions';
export function App() @{
  <Hydrate independent when={interaction({ events: 'click' })}>
    <section>
      <button type="button" data-octane-hydrate-selection="day" onClick={() => choose('Monday')}>Monday</button>
      <button type="button" data-octane-hydrate-selection="day" onClick={() => choose('Tuesday')}>Tuesday</button>
      <button type="button" onClick={send}>Send</button>
    </section>
  </Hydrate>
}`;
			const file = '/project/src/SelectionIntent.tsrx';
			const actions: string[] = [];
			let selected = 'Monday';
			let buttons: NodeListOf<HTMLButtonElement>;
			const modules = {
				'./actions': {
					choose(day: string) {
						selected = day;
						actions.push(`select:${day}`);
					},
					send() {
						actions.push(`send:${selected}`);
						if (changeGroup) buttons[1].setAttribute('data-octane-hydrate-selection', 'other');
					},
				},
			};
			const server = loadCompiledFixtureSource(source, {
				id: file,
				mode: 'server',
				compileOptions: { dev, hmr: false },
				runtimeModules: modules,
			});
			const child = loadCompiledFixtureSource(source, {
				id: file + '?octane-hydrate=0',
				mode: 'client',
				compileOptions: { dev, hmr: false },
				runtimeModules: modules,
			});
			const ownerDocument = await earlyDocument();
			ownerDocument.body.innerHTML = renderToString(server.App, undefined, {
				independentHydration: {
					buildId: 'intent-build',
					resolve: () => ({ moduleId: 'widget.js', styles: [] }),
				},
			}).html;
			buttons = ownerDocument.querySelectorAll('button');
			click(buttons[0]);
			click(buttons[1]);
			let resolve!: () => void;
			const ready = new Promise<void>((done) => {
				resolve = done;
			});
			const errors: unknown[] = [];
			const cleanup = bootstrapIndependentHydration(ownerDocument, {
				buildId: 'intent-build',
				loadStyles() {},
				async loadModule() {
					await ready;
					return child;
				},
				onError(error) {
					errors.push(error);
				},
			});
			try {
				click(buttons[2]);
				click(buttons[0]);
				click(buttons[1]);
				resolve();
				const expected = changeGroup
					? ['select:Tuesday', 'send:Tuesday']
					: ['select:Tuesday', 'send:Tuesday', 'select:Tuesday'];
				await vi.waitFor(() => expect(actions).toEqual(expected));
				expect(ownerDocument.querySelector('button')).toBe(buttons[0]);
				click(buttons[0]);
				click(buttons[0]);
				expect(actions.slice(expected.length)).toEqual(['select:Monday', 'select:Monday']);
				expect(errors).toEqual([]);
			} finally {
				cleanup();
			}
		},
	);

	it.each(['before bootstrap', 'after bootstrap', 'while loading'])(
		'keeps the latest consecutive selection without losing intervening commands (%s)',
		async (phase) => {
			const ownerDocument = await earlyDocument();
			const widget = boundary(ownerDocument, 'selections');
			const buttons = selections(widget);
			const activated: Event[] = [];
			let resolve!: (module: Record<string, unknown>) => void;
			const loaded = new Promise<Record<string, unknown>>((done) => {
				resolve = done;
			});
			let cleanup: (() => void) | undefined;
			if (phase !== 'before bootstrap') initializeIndependentHydrationEventCapture(ownerDocument);
			if (phase === 'while loading') {
				cleanup = registerIndependentHydrationIsland(widget, widgetManifest('selections'), {
					load: () => loaded,
					loadStyles() {},
				});
			}
			try {
				click(buttons[0]);
				const tuesday = click(buttons[1].firstElementChild!);
				const send = click(buttons[2]);
				click(buttons[0]);
				const latest = click(buttons[1]);
				const expected = [tuesday, send, latest];
				if (phase === 'while loading') {
					resolve({
						default({ intents }: { intents: readonly { event: Event }[] }) {
							activated.push(...intents.map((intent) => intent.event));
						},
					});
					await vi.waitFor(() => expectEvents(activated, expected));
				} else {
					initializeIndependentHydrationEventCapture(ownerDocument);
					expectEvents(
						takePendingHydrationIntents(widget)?.map((intent) => intent.event),
						expected,
					);
				}
			} finally {
				cleanup?.();
			}
		},
	);

	it('does not overflow when repeated early clicks replace one pending selection', async () => {
		const ownerDocument = await earlyDocument();
		const widget = boundary(ownerDocument, 'selection-overflow');
		const buttons = selections(widget);
		for (let i = 0; i < 300; i++) click(buttons[i % 2]);
		const latest = click(buttons[1]);
		initializeIndependentHydrationEventCapture(ownerDocument);
		expectEvents(
			takePendingHydrationIntents(widget)?.map((intent) => intent.event),
			[latest],
		);
	});

	it.each(['before bootstrap', 'after bootstrap'])(
		"keeps other groups and another widget's commands as selection barriers (%s)",
		async (phase) => {
			const ownerDocument = await earlyDocument();
			const widget = boundary(ownerDocument, 'grouped');
			const buttons = selections(widget);
			buttons[2].setAttribute('data-octane-hydrate-selection', 'view');
			const other = boundary(ownerDocument, 'other');
			if (phase === 'after bootstrap') initializeIndependentHydrationEventCapture(ownerDocument);
			const first = click(buttons[0]);
			const otherCommand = click(other.firstElementChild!);
			const second = click(buttons[1]);
			const view = click(buttons[2]);
			const third = click(buttons[0]);
			initializeIndependentHydrationEventCapture(ownerDocument);
			expectEvents(
				takePendingHydrationIntents(widget)?.map((intent) => intent.event),
				[first, second, view, third],
			);
			expectEvents(
				takePendingHydrationIntents(other)?.map((intent) => intent.event),
				[otherCommand],
			);
		},
	);

	it.each(['before bootstrap', 'after bootstrap'])(
		'coalesces only plain primary clicks on explicitly non-submitting buttons (%s)',
		async (phase) => {
			const ownerDocument = await earlyDocument();
			const widget = boundary(ownerDocument, 'native-neighbors');
			const buttons = selections(widget);
			if (phase === 'after bootstrap') initializeIndependentHydrationEventCapture(ownerDocument);
			const events: Event[] = [];
			for (const options of [
				{ shiftKey: true },
				{ ctrlKey: true },
				{ metaKey: true },
				{ altKey: true },
				{ button: 1 },
			]) {
				for (let index = 0; index < 2; index++) {
					const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
					buttons[0].dispatchEvent(event);
					events.push(event);
				}
			}
			buttons[1].removeAttribute('type');
			events.push(click(buttons[1]), click(buttons[1]));
			buttons[2].setAttribute('data-octane-hydrate-selection', '');
			events.push(click(buttons[2]), click(buttons[2]));
			initializeIndependentHydrationEventCapture(ownerDocument);
			expectEvents(
				takePendingHydrationIntents(widget)?.map((intent) => intent.event),
				events,
			);
		},
	);

	it('does not reinterpret early discrete clicks after a selection marker is added', async () => {
		const ownerDocument = await earlyDocument();
		const widget = boundary(ownerDocument, 'new-marker');
		const button = widget.firstElementChild!;
		const events = [click(button), click(button)];
		button.setAttribute('type', 'button');
		button.setAttribute('data-octane-hydrate-selection', 'day');
		initializeIndependentHydrationEventCapture(ownerDocument);
		expectEvents(
			takePendingHydrationIntents(widget)?.map((intent) => intent.event),
			events,
		);
	});

	it.each(['group', 'target', 'boundary'])(
		'drops an early selection whose original %s changes before handoff',
		async (change) => {
			const ownerDocument = await earlyDocument();
			const widget = boundary(ownerDocument, 'stale-selection');
			const buttons = selections(widget);
			click(buttons[0]);
			if (change === 'group') buttons[0].setAttribute('data-octane-hydrate-selection', 'other');
			else if (change === 'target') buttons[0].replaceWith(buttons[0].cloneNode(true));
			else widget.replaceWith(widget.cloneNode(true));
			initializeIndependentHydrationEventCapture(ownerDocument);
			expect(takePendingHydrationIntents(widget)).toBeUndefined();
		},
	);

	it('drops a changed selection while its code is loading without losing the next command', async () => {
		const ownerDocument = await earlyDocument();
		const widget = boundary(ownerDocument, 'loading-selection');
		const buttons = selections(widget);
		const activated: Event[] = [];
		let resolve!: (module: Record<string, unknown>) => void;
		const loaded = new Promise<Record<string, unknown>>((done) => {
			resolve = done;
		});
		const cleanup = registerIndependentHydrationIsland(
			widget,
			widgetManifest('loading-selection'),
			{
				load: () => loaded,
				loadStyles() {},
			},
		);
		try {
			click(buttons[0]);
			buttons[0].setAttribute('data-octane-hydrate-selection', 'other');
			const send = click(buttons[2]);
			resolve({
				default({ intents }: { intents: readonly { event: Event }[] }) {
					activated.push(...intents.map((intent) => intent.event));
				},
			});
			await vi.waitFor(() => expectEvents(activated, [send]));
		} finally {
			cleanup();
		}
	});

	it('keeps ordinary hydration and captured pointer events discrete', async () => {
		const ownerDocument = await earlyDocument();
		const widget = boundary(ownerDocument, 'pointer-barrier');
		const buttons = selections(widget);
		widget.removeAttribute('data-octane-hydrate-interaction-events');
		const first = click(buttons[0]);
		const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
		buttons[1].dispatchEvent(pointer);
		const second = click(buttons[1]);
		initializeIndependentHydrationEventCapture(ownerDocument);
		expectEvents(
			takePendingHydrationIntents(widget)?.map((intent) => intent.event),
			[first, pointer, second],
		);
		widget.removeAttribute('data-octane-hydrate-independent');
		const ordinary = [click(buttons[0]), click(buttons[1])];
		expectEvents(
			takePendingHydrationIntents(widget)?.map((intent) => intent.event),
			ordinary,
		);
	});
	it('does not charge signal-only streaming responses for independent capture', async () => {
		enableServerSignalBindings();
		const query$ = __queryAt(
			'g:signal-only-bootstrap',
			'signal-only-bootstrap',
			() => 'key',
			async () => 'ready',
		);
		const stream = await renderToReadableStream(
			() => {
				query$.snapshot();
				return '<p>Signal only</p>';
			},
			undefined,
			{ streamedSignals: { buildId: 'signal-build', documentId: 'signal-document' } },
		);
		const html = await new Response(stream).text();
		expect(html).toContain('__octaneStreamedRenderer');
		expect(html).not.toContain('__octaneEarlyHydrationIntents');
	});

	it.each(['streamed', 'buffered'])(
		'emits capture only for a capable completed build (%s)',
		async (mode) => {
			const render = async (capable: boolean, external = false) => {
				const options = capable
					? {
							...(external ? { earlySignalBootstrap: 'external' as const } : {}),
							independentHydration: {
								buildId: 'intent-build',
								resolve() {
									return undefined;
								},
							},
						}
					: {};
				return mode === 'streamed'
					? new Response(
							await renderToReadableStream(() => '<p>No widget yet</p>', undefined, options),
						).text()
					: renderToString(() => '<p>No widget yet</p>', undefined, options).html;
			};
			expect(await render(false)).not.toContain('__octaneEarlyHydrationIntents');
			const html = await render(true);
			const script = html.match(
				/<script[^>]*>(\(function\(g\)\{var z="__octaneStreamedSignalSelections"[\s\S]*?)<\/script>/,
			)?.[1];
			expect(script).toBeDefined();
			const ownerDocument = document.implementation.createHTMLDocument('Later first widget');
			new Function('document', 'globalThis', script!)(ownerDocument, {});
			const widget = boundary(ownerDocument, 'later-first');
			const event = click(widget.firstElementChild!);
			initializeIndependentHydrationEventCapture(ownerDocument);
			expect(takePendingHydrationIntents(widget)?.map((intent) => intent.event)).toEqual([event]);

			// An envelope-owning host installs the same capture before exposing any
			// widget, then omits the renderer's duplicate script. No client engine.
			const early = server.earlySignalBootstrapScript({
				independentHydration: true,
				nonce: 'host-"<&',
			});
			const externalDocument = document.implementation.createHTMLDocument('Host envelope');
			externalDocument.head.innerHTML = early;
			const earlyScript = externalDocument.head.querySelector('script')!;
			expect(earlyScript.getAttribute('nonce')).toBe('host-"<&');
			const host = {};
			new Function('document', 'globalThis', earlyScript.textContent!)(externalDocument, host);
			new Function('document', 'globalThis', earlyScript.textContent!)(externalDocument, host);
			const externalHtml = await render(true, true);
			expect(externalHtml).not.toContain('__octaneEarlyHydrationIntents');
			const externalWidget = boundary(externalDocument, 'host-first');
			const externalEvent = click(externalWidget.firstElementChild!);
			initializeIndependentHydrationEventCapture(externalDocument);
			expect(takePendingHydrationIntents(externalWidget)?.map((intent) => intent.event)).toEqual([
				externalEvent,
			]);
		},
	);

	it('hands every early discrete click to the exact widget once', async () => {
		const ownerDocument = await earlyDocument();
		const parent = boundary(ownerDocument, 'parent');
		const widget = boundary(ownerDocument, 'child');
		parent.append(widget);
		const buttons = widget.querySelectorAll('button');
		const events = [click(buttons[0]), click(buttons[1]), click(buttons[0])];
		initializeIndependentHydrationEventCapture(ownerDocument);
		expect(takePendingHydrationIntents(widget)?.map((intent) => intent.event)).toEqual(events);
		expect(takePendingHydrationIntents(parent)).toBeUndefined();
		expect(takePendingHydrationIntents(widget)).toBeUndefined();
		initializeIndependentHydrationEventCapture(ownerDocument);
		const later = click(buttons[1]);
		expect(takePendingHydrationIntents(widget)?.map((intent) => intent.event)).toEqual([later]);
	});

	it.each(['target', 'boundary'])(
		'drops a pre-module click when its exact %s is replaced',
		async (replace) => {
			const ownerDocument = await earlyDocument();
			const widget = boundary(ownerDocument, 'replace');
			const target = widget.firstElementChild!;
			click(target);
			if (replace === 'target') target.replaceWith(target.cloneNode(true));
			else widget.replaceWith(widget.cloneNode(true));
			initializeIndependentHydrationEventCapture(ownerDocument);
			expect(takePendingHydrationIntents(widget)).toBeUndefined();
			expect(
				takePendingHydrationIntents(ownerDocument.querySelector('[data-octane-hydrate-id]')!),
			).toBeUndefined();
		},
	);

	it('preserves independent native links before and after module handoff', async () => {
		const ownerDocument = await earlyDocument();
		const widget = boundary(ownerDocument, 'links');
		const anchor = widget.querySelector('a')!;
		expect(click(anchor).defaultPrevented).toBe(false);
		initializeIndependentHydrationEventCapture(ownerDocument);
		expect(takePendingHydrationIntents(widget)).toBeUndefined();
		expect(click(anchor).defaultPrevented).toBe(false);
		expect(takePendingHydrationIntents(widget)).toBeUndefined();
		widget.removeAttribute('data-octane-hydrate-independent');
		expect(click(anchor).defaultPrevented).toBe(true);
		expect(takePendingHydrationIntents(widget)).toHaveLength(1);
	});

	it('fails clearly on overflow instead of replaying a truncated discrete sequence', async () => {
		const ownerDocument = await earlyDocument();
		const widget = boundary(ownerDocument, 'overflow');
		for (let i = 0; i < 257; i++) click(widget.firstElementChild!);
		expect(() => initializeIndependentHydrationEventCapture(ownerDocument)).toThrow(
			/intent.*overflow/i,
		);
		expect(takePendingHydrationIntents(widget)).toBeUndefined();
		expect(click(widget.firstElementChild!).defaultPrevented).toBe(false);
	});

	it.each([false, true])(
		'activates from pre-module clicks after a later sidecar arrives without importing the parent (selection: %s)',
		async (selection) => {
			const ownerDocument = await earlyDocument();
			const parent = boundary(ownerDocument, 'dormant-parent');
			const widget = boundary(ownerDocument, 'late-widget');
			if (selection) selections(widget);
			parent.append(widget);
			const events = [
				click(widget.firstElementChild!),
				click(widget.firstElementChild!),
				click(widget.firstElementChild!),
			];
			const activated: Event[] = [];
			const load = vi.fn(async () => ({
				default({ intents }: { intents: readonly { event: Event }[] }) {
					activated.push(...intents.map((intent) => intent.event));
				},
			}));
			const cleanup = bootstrapIndependentHydration(ownerDocument, {
				buildId: 'intent-build',
				loadStyles() {},
				loadModule: load,
			});
			try {
				const sidecar = ownerDocument.createElement('script');
				sidecar.type = 'application/json';
				sidecar.setAttribute('data-octane-independent', '');
				sidecar.textContent = serializeIndependentHydrateManifest(
					createIndependentHydrateManifest(
						{
							version: 1,
							boundaryId: 'widget-template',
							exportName: 'default',
							captureSchema: [],
							hookSeed: 0,
							idSeed: 0,
							signalSites: [],
							parentDependencies: false,
						},
						[],
						'late-widget',
						'intent-build',
						{ moduleId: 'widget.js', styles: [] },
					),
				);
				widget.append(sidecar);
				await vi.waitFor(() => expectEvents(activated, selection ? [events[2]] : events));
				expect(load.mock.calls).toEqual([['widget.js']]);
			} finally {
				cleanup();
			}
		},
	);
});
