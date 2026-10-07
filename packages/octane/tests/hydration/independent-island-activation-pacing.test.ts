import { afterEach, expect, it, vi } from 'vitest';
import {
	bootstrapIndependentHydration,
	registerIndependentHydrationIsland,
	type IndependentHydrateActivationContext,
	type IndependentHydrateLifecycle,
} from '../../src/hydration/independent-island.js';
import { installSignalDocumentLifecycle } from '../../src/hydration/streamed-signals.js';
import {
	createIndependentHydrateManifest,
	serializeIndependentHydrateManifest,
} from '../../src/independent-hydration-protocol.js';
import { createScope } from '../../src/signals/index.js';

// Ready independent islands converge in one microtask checkpoint: repeated
// instances share one module promise, and a back/forward-cache restore resumes
// every unfinished island at once. Each activation is a synchronous hydration,
// so the browser needs a task boundary between them to deliver input or paint.

const cleanups: (() => void)[] = [];
let held: (() => void)[] | undefined;

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	// Every island is gone, so any queued turn is stale and the gate reopens.
	while (held?.length) held.shift()!();
	held = undefined;
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

/** Hold the tasks the gate posts, so a test can run them one at a time. */
function holdTasks(): (() => void)[] {
	const tasks: (() => void)[] = (held = []);
	vi.stubGlobal('scheduler', {
		postTask(callback: () => void) {
			tasks.push(callback);
		},
	});
	return tasks;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function manifest(id: string) {
	return createIndependentHydrateManifest(
		{
			version: 1,
			boundaryId: 'widget',
			exportName: 'default',
			captureSchema: [],
			hookSeed: 0,
			idSeed: 0,
			signalSites: [],
			parentDependencies: false,
		},
		[],
		id,
		'build',
		{ moduleId: 'widget.js', styles: [] },
	);
}

function wrapper(id: string, when: 'load' | 'interaction', ownerDocument = document): Element {
	const element = ownerDocument.createElement('div');
	element.setAttribute('data-octane-hydrate-id', id);
	element.setAttribute('data-octane-hydrate-when', when);
	const button = ownerDocument.createElement('button');
	button.type = 'button';
	button.textContent = id;
	element.append(button);
	ownerDocument.body.append(element);
	return element;
}

/** One widget module shared by every instance, as an island component's is. */
function widgetModule({ fail }: { fail?: string } = {}) {
	const log: string[] = [];
	const contexts = new Map<string, IndependentHydrateActivationContext>();
	const module = deferred<Record<string, unknown>>();
	return {
		log,
		contexts,
		load: vi.fn(() => module.promise),
		ready() {
			module.resolve({
				default(context: IndependentHydrateActivationContext) {
					const id = context.element.getAttribute('data-octane-hydrate-id')!;
					log.push(id);
					contexts.set(id, context);
					if (id === fail) throw new Error(`${id} failed`);
					return { unmount() {} };
				},
			});
		},
	};
}

function register(
	element: Element,
	widget: ReturnType<typeof widgetModule>,
	onError?: (error: unknown) => void,
): IndependentHydrateLifecycle {
	const id = element.getAttribute('data-octane-hydrate-id')!;
	const lifecycle = registerIndependentHydrationIsland(element, manifest(id), {
		load: widget.load,
		loadStyles() {},
		...(onError === undefined ? {} : { onError }),
	});
	cleanups.push(lifecycle);
	return lifecycle;
}

function click(element: Element): void {
	element
		.querySelector('button')!
		.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

it('gives each ready island its own task, so a task queued before them runs before the last one hydrates', async () => {
	// A document of its own keeps these real tasks away from the held ones.
	const ownerDocument = document.implementation.createHTMLDocument('');
	const widget = widgetModule();
	for (const id of ['a', 'b', 'c', 'd']) register(wrapper(id, 'load', ownerDocument), widget);
	await flush();
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		widget.log.push('task');
	};
	channel.port2.postMessage(null);
	widget.ready();
	await vi.waitFor(() => expect(widget.log).toHaveLength(5));
	expect(widget.log.filter((entry) => entry !== 'task')).toEqual(['a', 'b', 'c', 'd']);
	// The first island hydrates at once, in the task that readied it.
	expect(widget.log[0]).toBe('a');
	expect(widget.log.indexOf('task')).toBeLessThan(widget.log.indexOf('d'));
});

it('activates one island per task, captured input first, and keeps capturing for a waiting island', async () => {
	const tasks = holdTasks();
	const widget = widgetModule();
	for (const id of ['a', 'b', 'c']) register(wrapper(id, 'load'), widget);
	const clicked = wrapper('d', 'interaction');
	register(clicked, widget);
	click(clicked);
	await flush();
	widget.ready();
	await flush();
	expect(widget.log).toEqual(['a']);

	// Input reaching an island that waits for its turn must join its replay.
	// Were the island already replaying, it would have no hold to queue into.
	click(clicked);
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a', 'd']);
	expect(widget.contexts.get('d')!.intents.map((intent) => intent.event.type)).toEqual([
		'click',
		'click',
	]);
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a', 'd', 'b']);
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a', 'd', 'b', 'c']);
	tasks.shift()!();
	expect(tasks).toEqual([]);
});

it('lets pause and dispose cancel a waiting island without using up its task, and resume start again', async () => {
	const tasks = holdTasks();
	const widget = widgetModule();
	register(wrapper('a', 'load'), widget);
	const paused = register(wrapper('b', 'load'), widget);
	const disposed = register(wrapper('c', 'load'), widget);
	widget.ready();
	await flush();
	expect(widget.log).toEqual(['a']);

	paused.pause();
	disposed();
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a']);
	// Neither cancelled island took a turn, so nothing else is waiting.
	expect(tasks).toEqual([]);

	paused.resume();
	await flush();
	expect(widget.log).toEqual(['a', 'b']);
	expect(widget.load).toHaveBeenCalledTimes(4);
});

it('reports a failed activation and still gives the next island its turn', async () => {
	const tasks = holdTasks();
	const widget = widgetModule({ fail: 'b' });
	const errors: unknown[] = [];
	for (const id of ['a', 'b', 'c']) {
		register(wrapper(id, 'load'), widget, (error) => errors.push(error));
	}
	widget.ready();
	await flush();
	tasks.shift()!();
	await flush();
	expect(errors).toEqual([new Error('b failed')]);
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a', 'b', 'c']);
});

it('paces the islands a back/forward-cache restore resumes together', async () => {
	const tasks = holdTasks();
	const widget = widgetModule();
	const host = document.createElement('main');
	for (const id of ['a', 'b', 'c']) {
		const element = wrapper(id, 'load');
		const sidecar = document.createElement('script');
		sidecar.type = 'application/json';
		sidecar.setAttribute('data-octane-independent', '');
		sidecar.textContent = serializeIndependentHydrateManifest(manifest(id));
		element.append(sidecar);
		host.append(element);
	}
	document.body.append(host);
	const owner = createScope({ scopeKey: 'activation-pacing-restore' });
	const independent = bootstrapIndependentHydration(host, {
		buildId: 'build',
		loadModule: widget.load,
		loadStyles() {},
		signalOwner: owner,
	});
	const lifecycle = installSignalDocumentLifecycle({
		document,
		signalOwner: owner,
		buildId: 'build',
		documentId: 'document',
		independentHydration: independent,
		readIdentity: () => ({ buildId: 'build', documentId: 'document' }),
	});
	cleanups.push(() => {
		lifecycle.dispose();
		owner.dispose();
	});
	window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
	widget.ready();
	await flush();
	expect(widget.log).toEqual([]);

	window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	await flush();
	expect(widget.log).toEqual(['a']);
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a', 'b']);
	tasks.shift()!();
	await flush();
	expect(widget.log).toEqual(['a', 'b', 'c']);
});
