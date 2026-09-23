import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTransition } from 'octane';
import { renderToString } from 'octane/server';
import { createScope } from '../src/signals/index.js';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Every channel is a fixed scalar, so the compiler selects the scalar adopter.
// The general lane runs the same artifact through `__adoptBindings`, which is
// what earlier compiler output imported, so both must behave identically.
const BADGE = `export function Badge(props) @{
  'use dom bindings';
  <p title={props.title} class={props.classes} aria-live={props.live} hidden={props.hidden}><b>{props.count as number}</b></p>
}`;
const LINK = `export function Link(props) @{
  'use dom bindings';
  <a href={props.href}>{props.label as string}</a>
}`;

type View = DomBindings.CompiledBindings<Record<string, unknown>> & {
	adopt: typeof DomBindings.__adoptBindings;
};

const runtimeModules = {
	'octane/behavior': DomBindings,
	'octane/dom-bindings': DomBindings,
	'octane/dom-binding-signals': DomBindingSignals,
};

function compile(source: string, view: string, dev: boolean) {
	const id = `/src/${view}.tsrx`;
	const options = { compileOptions: { dev, hmr: false }, runtimeModules };
	const server = loadCompiledFixtureSource(source, { ...options, id, mode: 'server' });
	const artifact = loadCompiledFixtureSource(source, {
		...options,
		id: `${id}?octane-bindings=${view}`,
		mode: 'client',
	}).default as View;
	return { server, artifact };
}

function source(initial: Record<string, unknown>) {
	let snapshot = initial;
	const subscribers = new Set<() => void>();
	const cleanup = vi.fn();
	const getSnapshot = vi.fn(() => snapshot);
	return {
		cleanup,
		getSnapshot,
		subscribers,
		state: {
			getSnapshot,
			subscribe(notify: () => void) {
				subscribers.add(notify);
				return () => {
					subscribers.delete(notify);
					cleanup();
				};
			},
		},
		publish(next: Record<string, unknown>) {
			snapshot = { ...snapshot, ...next };
			for (const notify of [...subscribers]) notify();
		},
	};
}

const plain = { title: 'First', classes: 'a', live: 'polite', hidden: false, count: 1 };

afterEach(() => {
	document.body.replaceChildren();
});

describe.each([
	{ dev: false, lane: 'scalar' },
	{ dev: false, lane: 'general' },
	{ dev: true, lane: 'scalar' },
	{ dev: true, lane: 'general' },
] as const)('fixed scalar adoption (dev=$dev, $lane adopter)', ({ dev, lane }) => {
	function badge() {
		const { server, artifact } = compile(BADGE, 'Badge', dev);
		const view: View =
			lane === 'scalar' ? artifact : { ...artifact, adopt: DomBindings.__adoptBindings };
		document.body.innerHTML = renderToString(server.Badge, plain).html;
		const paragraph = document.querySelector('p')!;
		return {
			view,
			paragraph,
			text: paragraph.firstElementChild!.firstChild,
			adopt: (
				state: DomBindings.BindingSource<Record<string, unknown>>,
				options?: DomBindings.BindingOptions,
			) => view.adopt(paragraph, view, state, options),
		};
	}

	it('writes every channel in place and reads signal handles without the source', () => {
		const { paragraph, text, adopt } = badge();
		const scope = createScope({ scopeKey: `scalar-handles-${dev}-${lane}` });
		const count$ = scope.signal$('count', 2);
		const title$ = scope.signal$('title', 'Second');
		const model = source({ ...plain, title: title$, classes: ['a', 'b'], count: count$ });
		const handle = adopt(model.state);
		try {
			expect([
				paragraph.title,
				paragraph.className,
				paragraph.getAttribute('aria-live'),
				paragraph.hidden,
				paragraph.textContent,
			]).toEqual(['Second', 'a b', 'polite', false, '2']);
			expect(paragraph.firstElementChild!.firstChild).toBe(text);
			model.getSnapshot.mockClear();
			count$.set(3);
			title$.set('Third');
			expect([paragraph.title, paragraph.textContent]).toEqual(['Third', '3']);
			expect(model.getSnapshot).not.toHaveBeenCalled();

			model.publish({ count: 5, hidden: true, live: null });
			expect([paragraph.textContent, paragraph.hidden]).toEqual(['5', true]);
			expect(paragraph.hasAttribute('aria-live')).toBe(false);
			count$.set(4);
			expect(paragraph.textContent).toBe('5');
			model.publish({ count: count$ });
			expect(paragraph.textContent).toBe('4');
			expect(paragraph.firstElementChild!.firstChild).toBe(text);
		} finally {
			handle.dispose();
		}
		count$.set(9);
		title$.set('Late');
		expect([paragraph.title, paragraph.textContent]).toEqual(['Third', '4']);
		expect(model.subscribers.size).toBe(0);
		expect(scope.inspect().nodes.map((node) => node.subscribers)).toEqual([0, 0]);
		scope.dispose();
	});

	it('presents signal writes from an async transition Action atomically when it settles', async () => {
		const { paragraph, adopt } = badge();
		const scope = createScope({ scopeKey: `scalar-transition-${dev}-${lane}` });
		const count$ = scope.signal$('count', 1);
		// Registered before adoption: only a prepared presentation, committed with
		// the publication itself, is visible to an earlier public subscriber.
		const published: string[] = [];
		const unsubscribe = count$.subscribe(() => published.push(paragraph.textContent!));
		const handle = adopt(source({ ...plain, count: count$ }).state);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const observed: string[] = [];
		let settled!: Promise<void>;
		try {
			startTransition(() => {
				settled = (async () => {
					count$.set(2);
					observed.push(paragraph.textContent!);
					await gate;
					count$.set(3);
					observed.push(paragraph.textContent!);
				})();
				return settled;
			});
			observed.push(paragraph.textContent!);
			release();
			await settled;
			await vi.waitFor(() => expect(paragraph.textContent).toBe('3'));
			expect(observed).toEqual(['1', '1', '1']);
			expect(published).toEqual(['3']);
			count$.set(4);
			expect(paragraph.textContent).toBe('4');
		} finally {
			unsubscribe();
			handle.dispose();
			scope.dispose();
		}
	});

	it('releases claims and the source on abort, before adoption and after a failed snapshot', () => {
		const { paragraph, text, adopt } = badge();
		const aborted = new AbortController();
		aborted.abort();
		const early = source({ ...plain, title: 'Never' });
		adopt(early.state, { signal: aborted.signal });
		expect(early.subscribers.size).toBe(0);
		expect(early.getSnapshot).not.toHaveBeenCalled();
		expect(paragraph.title).toBe('First');

		const controller = new AbortController();
		const model = source({ ...plain, title: 'Live' });
		adopt(model.state, { signal: controller.signal });
		expect(paragraph.title).toBe('Live');
		controller.abort();
		expect(model.cleanup).toHaveBeenCalledOnce();
		model.publish({ title: 'After abort' });
		expect(paragraph.title).toBe('Live');

		const failing = source({ ...plain });
		const handle = adopt(failing.state);
		expect(() => failing.publish({ count: Promise.resolve(1) })).toThrow(/synchronous scalar/);
		expect(failing.cleanup).toHaveBeenCalledOnce();
		expect(paragraph.firstElementChild!.firstChild).toBe(text);
		expect(paragraph.textContent).toBe('1');
		handle.dispose();

		const thenable = source({ ...plain });
		thenable.getSnapshot.mockImplementation(() => Promise.resolve(plain) as never);
		expect(() => adopt(thenable.state)).toThrow(/not a thenable/);
		expect(thenable.cleanup).toHaveBeenCalledOnce();

		const next = source({ ...plain, title: 'Readopted' });
		adopt(next.state).dispose();
		expect(paragraph.title).toBe('Readopted');
	});

	it('accepts notification during subscription and disposal during a snapshot read', () => {
		const { paragraph, adopt } = badge();
		let snapshot = { ...plain, title: 'Subscribed' };
		const handle = adopt({
			getSnapshot: () => snapshot,
			subscribe(notify) {
				snapshot = { ...snapshot, title: 'Notified while subscribing' };
				notify();
				return () => {};
			},
		});
		expect(paragraph.title).toBe('Notified while subscribing');
		handle.dispose();

		let reentrant: DomBindings.BindingHandle | undefined;
		const notify = new Set<() => void>();
		let disposeOnRead = false;
		reentrant = adopt({
			getSnapshot() {
				if (disposeOnRead) reentrant!.dispose();
				return { ...plain, title: disposeOnRead ? 'Disposed' : 'Before' };
			},
			subscribe(listener) {
				notify.add(listener);
				return () => notify.delete(listener);
			},
		});
		expect(paragraph.title).toBe('Before');
		disposeOnRead = true;
		for (const listener of [...notify]) listener();
		expect(paragraph.title).toBe('Before');
		expect(notify.size).toBe(0);
	});
});

describe.each([false, true])('scalar adopter ownership (dev=%s)', (dev) => {
	it('shares channel claims with the general adopter in both orders', () => {
		const { server, artifact } = compile(BADGE, 'Badge', dev);
		const general = { ...artifact, adopt: DomBindings.__adoptBindings };
		document.body.innerHTML = renderToString(server.Badge, plain).html;
		const paragraph = document.querySelector('p')!;
		for (const [first, second] of [
			[artifact, general],
			[general, artifact],
		]) {
			const owner = first.adopt(paragraph, first, source(plain).state);
			const rejected = source({ ...plain, title: 'Rejected' });
			expect(() => second.adopt(paragraph, second, rejected.state)).toThrow(
				/already has a binding/,
			);
			expect(rejected.subscribers.size).toBe(0);
			expect(paragraph.title).toBe('First');
			owner.dispose();
			second.adopt(paragraph, second, source({ ...plain, title: 'Successor' }).state).dispose();
			expect(paragraph.title).toBe('Successor');
			paragraph.title = 'First';
		}
	});

	// The compiler emits the scalar entry only with proof. If an artifact reaches
	// it without that proof, no URL may be written without sanitization.
	it('refuses an artifact that needs the general adopter before claiming anything', () => {
		const { server, artifact } = compile(LINK, 'Link', dev);
		document.body.innerHTML = renderToString(server.Link, {
			href: '/safe',
			label: 'Safe',
		}).html;
		const anchor = document.querySelector('a')!;
		const unsafe = source({ href: 'javascript:alert(1)', label: 'Unsafe' });
		expect(() => DomBindings.__adoptScalarBindings(anchor, artifact, unsafe.state)).toThrow(
			/requires the general adopter/,
		);
		expect(unsafe.subscribers.size).toBe(0);
		expect(anchor.getAttribute('href')).toBe('/safe');
		const badge = compile(BADGE, 'Badge', dev).artifact;
		for (const descriptor of [
			{ ...badge, handoff: 'host' as const },
			{ ...badge, addressed: true as const },
			{ ...badge, connectProjection: DomBindings.__adoptBindings as never },
		]) {
			expect(() =>
				DomBindings.__adoptScalarBindings(anchor, descriptor, source(plain).state),
			).toThrow(/requires the general adopter/);
		}
		// The general adopter still owns and sanitizes the refused artifact.
		const handle = artifact.adopt(anchor, artifact, unsafe.state);
		expect(anchor.getAttribute('href')).not.toBe('javascript:alert(1)');
		expect(anchor.textContent).toBe('Unsafe');
		handle.dispose();
	});
});
