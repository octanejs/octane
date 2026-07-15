import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { act, flushEffects, mount } from '../_helpers';
import { loadServerFixture } from '../_server-fixture.js';
import {
	ActivityEffectEventMutation,
	CommittedEventBoundary,
	ConditionalEventCleanup,
	CustomHookEffectEventCounter,
	EffectEventBeforeEffects,
	EffectEventChatRoom,
	EffectEventCounter,
	EffectEventDuringRender,
	EffectEventLogVisit,
	EffectEventMemoPropIdentity,
	EffectEventOrder,
	EffectEventThis,
	FreshActivityEffectEvent,
	IndependentSiblingSuspenseEventBoundary,
	LayoutEffectEventCounter,
	MemoContextEffectEvent,
	MultipleEffectEvents,
	PassiveEffectEventCounter,
	RefPropContextEffectEvent,
	SiblingSuspenseEventBoundary,
} from './_fixtures/effect-event.tsrx';

const server = loadServerFixture('packages/octane/tests/conformance/_fixtures/effect-event.tsrx');

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('useEffectEvent conformance', () => {
	// Per useEffectEvent-test.js:58 (React canary b740af2).
	it('memoizes basic case correctly', () => {
		const r = mount(EffectEventCounter, { incrementBy: 1 });
		expect(r.find('#increment').textContent).toBe('0');
		r.click('#increment');
		r.click('#increment');
		expect(r.find('#increment').textContent).toBe('2');

		r.update(EffectEventCounter, { incrementBy: 10 });
		r.click('#increment');
		expect(r.find('#increment').textContent).toBe('12');
		r.unmount();
	});

	// Per useEffectEvent-test.js:133 (React canary b740af2).
	it('can be defined more than once', () => {
		const r = mount(MultipleEffectEvents, { amount: 5 });
		r.click('#add');
		expect(r.find('output').textContent).toBe('6');
		r.click('#multiply');
		expect(r.find('output').textContent).toBe('30');
		r.unmount();
	});

	// Per useEffectEvent-test.js:194 (React canary b740af2).
	it('does not preserve `this` in event functions', () => {
		const receivers: unknown[] = [];
		const r = mount(EffectEventThis, { observe: (value: unknown) => receivers.push(value) });
		r.click('button');
		expect(receivers).toEqual([undefined]);
		r.unmount();
	});

	// Per useEffectEvent-test.js:243 (React canary b740af2).
	it('throws when called in render', () => {
		expect(() => mount(EffectEventDuringRender)).toThrow(
			"A function wrapped in useEffectEvent can't be called during rendering.",
		);
	});

	// Per useEffectEvent-test.js:276 (React canary b740af2).
	it("useLayoutEffect shouldn't re-fire when event handlers change", () => {
		const log: string[] = [];
		const r = mount(LayoutEffectEventCounter, { incrementBy: 1, log: log.push.bind(log) });
		expect(r.find('#increment').textContent).toBe('1');
		expect(log).toEqual(['layout 1']);

		r.click('#increment');
		expect(r.find('#increment').textContent).toBe('2');
		expect(log).toEqual(['layout 1']);

		r.update(LayoutEffectEventCounter, { incrementBy: 10, log: log.push.bind(log) });
		expect(r.find('#increment').textContent).toBe('12');
		expect(log).toEqual(['layout 1', 'layout 10']);
		r.unmount();
	});

	// Per useEffectEvent-test.js:375 (React canary b740af2).
	it("useEffect shouldn't re-fire when event handlers change", async () => {
		const log: string[] = [];
		const r = mount(PassiveEffectEventCounter, { incrementBy: 1, log: log.push.bind(log) });
		await act(() => {});
		expect(r.find('#increment').textContent).toBe('1');
		expect(log).toEqual(['passive 1']);

		r.click('#increment');
		expect(r.find('#increment').textContent).toBe('2');
		expect(log).toEqual(['passive 1']);

		r.update(PassiveEffectEventCounter, { incrementBy: 10, log: log.push.bind(log) });
		await act(() => {});
		expect(r.find('#increment').textContent).toBe('12');
		expect(log).toEqual(['passive 1', 'passive 10']);
		r.unmount();
	});

	// Per useEffectEvent-test.js:473 (React canary b740af2). “Stable” means the
	// custom hook's registered wrapper stays fresh, not stable wrapper identity.
	it('is stable in a custom hook', async () => {
		const log: string[] = [];
		const r = mount(CustomHookEffectEventCounter, {
			incrementBy: 1,
			log: log.push.bind(log),
		});
		await act(() => {});
		expect(r.find('#increment').textContent).toBe('1');

		r.click('#increment');
		expect(r.find('#increment').textContent).toBe('2');
		r.update(CustomHookEffectEventCounter, {
			incrementBy: 10,
			log: log.push.bind(log),
		});
		await act(() => {});
		expect(r.find('#increment').textContent).toBe('12');
		expect(log).toEqual(['custom 1', 'custom 10']);
		r.unmount();
	});

	// Per useEffectEvent-test.js:577 (React canary b740af2).
	it('is mutated before all other effects', () => {
		const log: string[] = [];
		const push = log.push.bind(log);
		const r = mount(EffectEventBeforeEffects, { value: 1, log: push });
		expect(log).toEqual(['insertion 1', 'event 1']);

		log.length = 0;
		r.update(EffectEventBeforeEffects, { value: 2, log: push });
		expect(log).toEqual(['insertion 2', 'event 2']);
		r.unmount();
	});

	// Per useEffectEvent-test.js:600 (React canary b740af2).
	it('fires all (interleaved) effects with useEffectEvent in correct order', () => {
		const log: string[] = [];
		const push = log.push.bind(log);
		const r = mount(EffectEventOrder, { value: 1, log: push });
		flushEffects();
		expect(log).toEqual([
			'child insertion create child 1 / parent 1',
			'parent insertion create parent 1',
			'child layout create child 1 / parent 1',
			'parent layout create parent 1',
			'child passive create child 1 / parent 1',
			'parent passive create parent 1',
		]);

		log.length = 0;
		r.update(EffectEventOrder, { value: 2, log: push });
		flushEffects();
		expect(log).toEqual([
			'child insertion destroy child 2 / parent 2',
			'child insertion create child 2 / parent 2',
			'child layout destroy child 2 / parent 2',
			'parent insertion destroy parent 2',
			'parent insertion create parent 2',
			'parent layout destroy parent 2',
			'child layout create child 2 / parent 2',
			'parent layout create parent 2',
			'child passive destroy child 2 / parent 2',
			'parent passive destroy parent 2',
			'child passive create child 2 / parent 2',
			'parent passive create parent 2',
		]);

		log.length = 0;
		r.unmount();
		flushEffects();
		expect(log).toEqual([
			'parent insertion destroy parent 2',
			'parent layout destroy parent 2',
			'child insertion destroy child 2 / parent 2',
			'child layout destroy child 2 / parent 2',
			'parent passive destroy parent 2',
			'child passive destroy child 2 / parent 2',
		]);
	});

	// Per useEffectEvent-test.js:708 (React canary b740af2).
	// The canary labels its stale ViewTransition branch as an upstream bug; this
	// port intentionally asserts the fixed/fresh Activity semantics instead.
	it('correctly mutates effect event with Activity', () => {
		const log: string[] = [];
		const push = log.push.bind(log);
		const r = mount(ActivityEffectEventMutation, { value: 1, mode: 'hidden', log: push });
		expect(log).toEqual(['child insertion parent 1 child 1']);

		log.length = 0;
		r.update(ActivityEffectEventMutation, { value: 2, mode: 'hidden', log: push });
		expect(log).toEqual(['child insertion parent 2 child 2']);

		log.length = 0;
		r.update(ActivityEffectEventMutation, { value: 2, mode: 'visible', log: push });
		expect(log).toContain('child layout parent 2 child 2');

		log.length = 0;
		r.update(ActivityEffectEventMutation, { value: 3, mode: 'hidden', log: push });
		expect(log).toContain('child layout destroy parent 3 child 3');
		r.unmount();
	});

	// Per useEffectEvent-test.js:947 (React canary b740af2).
	it("doesn't provide a stable identity", () => {
		const wrappers: Array<() => number> = [];
		const observe = (event: () => number) => wrappers.push(event);
		const r = mount(EffectEventMemoPropIdentity, { observe });
		r.click('button');

		expect(wrappers).toHaveLength(2);
		expect(wrappers[1]).not.toBe(wrappers[0]);
		expect(wrappers[0]()).toBe(2);
		expect(wrappers[1]()).toBe(2);
		r.unmount();
	});

	// Per useEffectEvent-test.js:985 (React canary b740af2), strengthened with
	// suspended and failed renders: neither may publish its closure later.
	it('event handlers always see the latest committed value', async () => {
		const wrappers: Array<() => string> = [];
		const observe = (event: () => string) => wrappers.push(event);
		const gate = deferred<string>();
		const r = mount(CommittedEventBoundary, {
			value: 'A',
			resource: null,
			error: false,
			observe,
		});
		const registered = wrappers[0];
		expect(registered()).toBe('A');

		r.update(CommittedEventBoundary, {
			value: 'B',
			resource: null,
			error: false,
			observe,
		});
		expect(registered()).toBe('B');

		r.update(CommittedEventBoundary, {
			value: 'C',
			resource: gate.promise,
			error: false,
			observe,
		});
		expect(r.find('.pending').textContent).toBe('pending');
		expect(registered()).toBe('B');
		await act(() => gate.resolve('ready'));
		expect(r.find('.value').textContent).toBe('C');
		expect(registered()).toBe('C');
		r.unmount();

		const failedWrappers: Array<() => string> = [];
		const failedObserve = (event: () => string) => failedWrappers.push(event);
		const failed = mount(CommittedEventBoundary, {
			value: 'committed',
			resource: null,
			error: false,
			observe: failedObserve,
		});
		const beforeFailure = failedWrappers[0];
		failed.update(CommittedEventBoundary, {
			value: 'failed',
			resource: null,
			error: true,
			observe: failedObserve,
		});
		expect(failed.find('.caught').textContent).toBe('render failed');
		expect(beforeFailure()).toBe('committed');
		failed.update(CommittedEventBoundary, {
			value: 'still failed',
			resource: null,
			error: true,
			observe: failedObserve,
		});
		expect(beforeFailure()).toBe('committed');
		failed.unmount();
	});

	it('does not publish a completed sibling from an aborted Suspense boundary', async () => {
		const eventRef = { current: null as null | (() => string) };
		const gate = deferred<string>();
		const r = mount(SiblingSuspenseEventBoundary, {
			value: 'committed',
			resource: null,
			eventRef,
		});
		await act(() => {});
		const registered = eventRef.current!;
		expect(registered()).toBe('committed');

		r.update(SiblingSuspenseEventBoundary, {
			value: 'aborted',
			resource: gate.promise,
			eventRef,
		});
		expect(r.find('.sibling-pending').textContent).toBe('pending');
		expect(registered()).toBe('committed');

		await act(() => gate.resolve('ready'));
		expect(r.find('.registered-sibling').textContent).toBe('aborted');
		expect(registered()).toBe('aborted');
		r.unmount();
	});

	it('does not publish an independently updated sibling when its boundary suspends', async () => {
		const eventRef = { current: null as null | (() => string) };
		const setValueRef = { current: null as null | ((value: string) => void) };
		const setResourceRef = {
			current: null as null | ((resource: Promise<string>) => void),
		};
		const gate = deferred<string>();
		const r = mount(IndependentSiblingSuspenseEventBoundary, {
			eventRef,
			setValueRef,
			setResourceRef,
		});
		await act(() => {});
		const registered = eventRef.current!;
		expect(registered()).toBe('committed');

		act(() => {
			setValueRef.current!('aborted');
			setResourceRef.current!(gate.promise);
		});
		expect(r.find('.independent-sibling-pending').textContent).toBe('pending');
		expect(registered()).toBe('committed');

		await act(() => gate.resolve('ready'));
		expect(r.find('.independent-event-sibling').textContent).toBe('aborted');
		expect(registered()).toBe('aborted');
		r.unmount();
	});

	it('allows Effect Events in conditional branch deletion cleanups', () => {
		const log: string[] = [];
		const push = log.push.bind(log);
		const r = mount(ConditionalEventCleanup, {
			show: true,
			value: 'committed',
			log: push,
		});

		r.update(ConditionalEventCleanup, {
			show: false,
			value: 'ignored',
			log: push,
		});
		expect(r.find('.conditional-event-empty').textContent).toBe('empty');
		expect(log).toEqual(['cleanup committed connected=true']);
		r.unmount();
	});

	// Per useEffectEvent-test.js:1034 (React canary b740af2).
	it('integration: implements docs chat room example', async () => {
		const log: string[] = [];
		const connectedRooms: string[] = [];
		const disconnectedRooms: string[] = [];
		let connected: (() => void) | null = null;
		const connection = {
			connect(roomId: string, callback: () => void) {
				connectedRooms.push(roomId);
				connected = callback;
				return () => disconnectedRooms.push(roomId);
			},
		};
		const r = mount(EffectEventChatRoom, {
			roomId: 'general',
			theme: 'light',
			connection,
			log: log.push.bind(log),
		});
		await act(() => {});
		connected!();
		expect(log).toEqual(['connected light']);

		r.update(EffectEventChatRoom, {
			roomId: 'general',
			theme: 'dark',
			connection,
			log: log.push.bind(log),
		});
		await act(() => {});
		connected!();
		expect(log).toEqual(['connected light', 'connected dark']);
		expect(connectedRooms).toEqual(['general']);

		r.update(EffectEventChatRoom, {
			roomId: 'music',
			theme: 'dark',
			connection,
			log: log.push.bind(log),
		});
		await act(() => {});
		connected!();
		expect(connectedRooms).toEqual(['general', 'music']);
		expect(disconnectedRooms).toEqual(['general']);
		expect(log.at(-1)).toBe('connected dark');
		r.unmount();
	});

	// Per useEffectEvent-test.js:1122 (React canary b740af2).
	it('integration: implements the docs logVisit example', async () => {
		const log: string[] = [];
		const push = log.push.bind(log);
		const r = mount(EffectEventLogVisit, { url: '/shop/1', log: push });
		await act(() => {});
		expect(log).toEqual(['/shop/1 items=0']);

		r.click('#add');
		expect(r.find('#add').textContent).toBe('1');
		r.update(EffectEventLogVisit, { url: '/shop/2', log: push });
		await act(() => {});
		expect(log).toEqual(['/shop/1 items=0', '/shop/2 items=1']);
		r.unmount();
	});

	// Per useEffectEvent-test.js:1191 (React canary b740af2).
	it('reads the latest context value in memo Components', async () => {
		const eventRef = { current: null as null | (() => string) };
		const r = mount(MemoContextEffectEvent, { value: 'first', eventRef });
		await act(() => {});
		const registered = eventRef.current!;
		expect(registered()).toBe('first');

		r.update(MemoContextEffectEvent, { value: 'second', eventRef });
		expect(registered()).toBe('second');
		r.unmount();
	});

	// Per useEffectEvent-test.js:1230 (React canary b740af2). Octane has no
	// forwardRef; React 19-style ref-as-prop is the corresponding public surface.
	it('reads the latest context value in forwardRef Components', async () => {
		const eventRef = { current: null as null | (() => string) };
		const r = mount(RefPropContextEffectEvent, { value: 'first', eventRef });
		await act(() => {});
		const registered = eventRef.current!;
		expect(registered()).toBe('first');

		r.update(RefPropContextEffectEvent, { value: 'second', eventRef });
		expect(registered()).toBe('second');
		r.unmount();
	});

	// Per useEffectEvent-test.js:1269 (React canary b740af2).
	// The canary labels its stale ViewTransition branch as an upstream bug; this
	// port intentionally asserts the fixed/fresh Activity semantics instead.
	it('effect events are fresh inside Activity', () => {
		const log: string[] = [];
		const push = log.push.bind(log);
		const r = mount(FreshActivityEffectEvent, { value: 1, mode: 'hidden', log: push });
		expect(log).toEqual(['insertion create 1']);

		log.length = 0;
		r.update(FreshActivityEffectEvent, { value: 2, mode: 'hidden', log: push });
		expect(log).toEqual(['insertion destroy 2', 'insertion create 2']);

		log.length = 0;
		r.update(FreshActivityEffectEvent, { value: 2, mode: 'visible', log: push });
		expect(log).toContain('layout create 2');
		expect(log.every((entry) => !entry.endsWith(' 1'))).toBe(true);

		log.length = 0;
		r.update(FreshActivityEffectEvent, { value: 3, mode: 'hidden', log: push });
		expect(log).toContain('layout destroy 3');
		expect(log.every((entry) => !entry.endsWith(' 2'))).toBe(true);
		r.unmount();
	});
});

describe('useEffectEvent server conformance', () => {
	// Per ReactDOMFizzServer-test.js:6791 (React canary b740af2).
	it('can server render a component with useEffectEvent', () => {
		const { html } = ServerRuntime.renderToString(server.ServerEffectEventDeclaration);
		expect(html).toContain('<button class="server-effect-event">ready</button>');
	});

	// Per ReactDOMFizzServer-test.js:6821 (React canary b740af2).
	it('throws if useEffectEvent is called during a server render', () => {
		expect(() => ServerRuntime.renderToString(server.ServerEffectEventInvocation)).toThrow(
			"A function wrapped in useEffectEvent can't be called during rendering.",
		);
	});

	// Per ReactDOMFizzServer-test.js:6852 (React canary b740af2).
	it('does not guarantee useEffectEvent return values during server rendering are distinct', () => {
		const { html } = ServerRuntime.renderToString(server.ServerEffectEventIdentity);
		expect(html).toContain('<div class="server-effect-event-shared"></div>');
		expect(html).not.toContain('server-effect-event-distinct');
	});
});
