import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	__profileBail,
	__profileBeginRender,
	__profileComponent,
	__profileComponentSource,
	__profileEndRender,
	__profileHook,
	__profileSchedule,
	__profileTrackComponent,
	profiler,
} from '../src/profiling';

beforeEach(() => {
	profiler.clear();
	profiler.start({ bufferSize: 10_000, timeline: false });
});

describe('profiling recorder', () => {
	it('computes nested inclusive/self duration and preserves compiler metadata', () => {
		function Parent() {}
		function Child() {}
		__profileComponent(Parent, {
			id: 'src/App.tsrx#Parent',
			name: 'Parent',
			file: 'src/App.tsrx',
			line: 2,
			column: 0,
			kind: 'component',
		});
		__profileComponent(Child, {
			id: 'src/App.tsrx#Child',
			name: 'Child',
			file: 'src/App.tsrx',
			line: 8,
			column: 0,
			kind: 'component',
		});
		const parent = {};
		const child = {};
		__profileTrackComponent(parent, Parent);
		__profileTrackComponent(child, Child);
		const outer = __profileBeginRender(parent, Parent, false);
		const inner = __profileBeginRender(child, Child, false);
		__profileEndRender(inner, false);
		__profileEndRender(outer, false);

		const [childEvent, parentEvent] = profiler.getEvents();
		expect(childEvent.component).toBe('Child');
		expect(parentEvent.component).toBe('Parent');
		expect(parentEvent.duration).toBeGreaterThanOrEqual(childEvent.duration);
		expect(parentEvent.selfDuration).toBeLessThanOrEqual(parentEvent.duration);
		expect(parentEvent.selfDuration + childEvent.duration).toBeCloseTo(parentEvent.duration, 5);
	});

	it('flushes nested Chrome timestamps only after the outer frame closes', () => {
		function Parent() {}
		function Child() {}
		const parent = {};
		const child = {};
		__profileTrackComponent(parent, Parent);
		__profileTrackComponent(child, Child);
		const timestamp = vi.fn();
		const prior = console.timeStamp;
		(console as any).timeStamp = timestamp;
		try {
			profiler.start({ timeline: true });
			const outer = __profileBeginRender(parent, Parent, false);
			const inner = __profileBeginRender(child, Child, false);
			__profileEndRender(inner, false);
			expect(timestamp).not.toHaveBeenCalled();
			__profileEndRender(outer, false);
			expect(timestamp.mock.calls.map((call) => call[0])).toEqual([
				'Child (mount)',
				'Parent (mount)',
			]);
		} finally {
			(console as any).timeStamp = prior;
		}
	});

	it('merges bounded hook causes, classifies outcomes, and keeps the buffer bounded', () => {
		function Counter() {}
		__profileComponent(Counter, {
			id: 'src/Counter.tsrx#Counter',
			name: 'Counter',
			file: 'src/Counter.tsrx',
			line: 1,
			column: 0,
			kind: 'component',
		});
		const slot = __profileHook(Symbol('state'), {
			id: 'src/Counter.tsrx#Counter#hook:0',
			componentId: 'src/Counter.tsrx#Counter',
			name: 'count',
			kind: 'useState',
			file: 'src/Counter.tsrx',
			line: 2,
			column: 16,
			index: 0,
		});
		const subject = {};
		__profileTrackComponent(subject, Counter);
		__profileSchedule(subject, 'state', slot);
		__profileSchedule(subject, 'state', slot);
		let frame = __profileBeginRender(subject, Counter, true);
		__profileEndRender(frame, false);
		expect(profiler.getEvents()[0].causes).toEqual([
			{ type: 'state', hook: 'count', source: 'src/Counter.tsrx:2:16' },
		]);

		frame = __profileBeginRender(subject, Counter, true);
		__profileEndRender(frame, true, Promise.resolve());
		frame = __profileBeginRender(subject, Counter, true);
		__profileEndRender(frame, true, new Error('private message'));
		expect(profiler.getEvents().map((event) => event.outcome)).toEqual([
			'completed',
			'errored',
			'errored',
		]);
		expect(JSON.stringify(profiler.getEvents())).not.toContain('private message');

		profiler.start({ bufferSize: 2 });
		expect(profiler.getEvents()).toHaveLength(2);
	});

	it('preserves anonymous component names with native function descriptors', () => {
		const metadata = (name: string, line: number) => ({
			id: `src/Names.tsrx#${name}@${line}:0`,
			name,
			file: 'src/Names.tsrx',
			line,
			column: 0,
			kind: 'component',
		});
		const Arrow = __profileComponent(() => {}, metadata('Arrow', 1));
		const Expression = __profileComponent(function () {}, metadata('Expression', 2));
		const Default = __profileComponent(function () {}, metadata('default', 3));
		function ExistingWrapper() {}
		__profileComponent(ExistingWrapper, metadata('Different', 4));

		for (const [component, name] of [
			[Arrow, 'Arrow'],
			[Expression, 'Expression'],
			[Default, 'default'],
		] as const) {
			expect(component.name).toBe(name);
			expect(Object.getOwnPropertyDescriptor(component, 'name')).toEqual({
				value: name,
				writable: false,
				enumerable: false,
				configurable: true,
			});
		}
		expect(ExistingWrapper.name).toBe('ExistingWrapper');
	});

	it('keeps recording usable when a hardened host reserves the DevTools global', () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__OCTANE_PROFILER__');
		Object.defineProperty(globalThis, '__OCTANE_PROFILER__', {
			value: null,
			writable: false,
			configurable: true,
		});
		try {
			function HardenedHost() {}
			expect(() =>
				__profileComponent(HardenedHost, {
					id: 'src/Hardened.tsrx#HardenedHost@1:0',
					name: 'HardenedHost',
					file: 'src/Hardened.tsrx',
					line: 1,
					column: 0,
					kind: 'component',
				}),
			).not.toThrow();
			const subject = {};
			__profileTrackComponent(subject, HardenedHost);
			__profileEndRender(__profileBeginRender(subject, HardenedHost, false), false);
			expect(profiler.why(HardenedHost)).toHaveLength(1);
		} finally {
			if (descriptor === undefined) delete globalThis.__OCTANE_PROFILER__;
			else Object.defineProperty(globalThis, '__OCTANE_PROFILER__', descriptor);
		}
	});

	it('supports summaries, recent reasons, trace export, stop, and Chrome timestamps', () => {
		function Row() {}
		__profileComponent(Row, {
			id: 'src/Row.tsrx#Row',
			name: 'Row',
			file: 'src/Row.tsrx',
			line: 4,
			column: 2,
			kind: 'component',
		});
		const timestamp = vi.fn();
		const prior = console.timeStamp;
		(console as any).timeStamp = timestamp;
		try {
			profiler.start({ timeline: true });
			const subject = {};
			__profileTrackComponent(subject, Row);
			const frame = __profileBeginRender(subject, Row, false);
			__profileEndRender(frame, false);
			expect(timestamp).toHaveBeenCalledTimes(1);
			expect(profiler.summary()[0]).toMatchObject({
				component: 'Row',
				attempts: 1,
				completed: 1,
				bails: 0,
				dominantCause: 'mount',
			});
			expect(profiler.why('Row')).toHaveLength(1);
			expect(profiler.why('src/Row.tsrx#Row')).toHaveLength(1);
			expect(profiler.exportTrace().traceEvents[0]).toMatchObject({
				name: 'Row (mount)',
				cat: 'octane.component',
				ph: 'X',
			});
			const trace = profiler.exportTrace();
			const traceCauses = trace.traceEvents[0].args.causes as Array<{ type: string }>;
			traceCauses[0].type = 'mutated';
			traceCauses.push({ type: 'injected' });
			expect(profiler.why(Row)[0].causes).toEqual([{ type: 'mount' }]);

			const inFlight = __profileBeginRender(subject, Row, true);
			profiler.stop();
			__profileEndRender(inFlight, false);
			expect(__profileBeginRender({}, Row, false)).toBeNull();
			expect(profiler.getEvents()).toHaveLength(1);
		} finally {
			(console as any).timeStamp = prior;
		}
	});

	it('counts zero-delay schedules, clears pending reasons on stop, and wraps in order', () => {
		function Scheduled() {}
		__profileComponent(Scheduled, {
			id: 'src/Scheduled.tsrx#Scheduled@1:0',
			name: 'Scheduled',
			file: 'src/Scheduled.tsrx',
			line: 1,
			column: 0,
			kind: 'component',
		});
		const subject = {};
		__profileTrackComponent(subject, Scheduled);
		let clock = 10;
		const clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
		try {
			__profileSchedule(subject, 'state');
			__profileEndRender(__profileBeginRender(subject, Scheduled, true), false);
			clock = 20;
			__profileSchedule(subject, 'state');
			clock = 30;
			__profileEndRender(__profileBeginRender(subject, Scheduled, true), false);
			expect(profiler.getEvents().map((event) => [event.scheduled, event.queueDelay])).toEqual([
				[true, 0],
				[true, 10],
			]);
			expect(profiler.summary()[0].averageQueueDelay).toBe(5);

			__profileSchedule(subject, 'state');
			profiler.stop();
			profiler.start({ timeline: false });
			__profileEndRender(__profileBeginRender(subject, Scheduled, true), false);
			const afterRestart = profiler.getEvents().at(-1)!;
			expect(afterRestart.scheduled).toBe(false);
			expect(afterRestart.causes).toEqual([{ type: 'unknown' }]);
		} finally {
			clockSpy.mockRestore();
		}

		profiler.clear();
		profiler.start({ bufferSize: 3, timeline: false });
		for (let index = 0; index < 5; index++)
			__profileEndRender(__profileBeginRender(subject, Scheduled, true), false);
		expect(profiler.getEvents().map((event) => event.attempt)).toEqual([3, 4, 5]);
		profiler.start({ bufferSize: 2 });
		expect(profiler.getEvents().map((event) => event.attempt)).toEqual([4, 5]);
		__profileEndRender(__profileBeginRender(subject, Scheduled, true), false);
		expect(profiler.getEvents().map((event) => event.attempt)).toEqual([5, 6]);
		expect(() => profiler.start({ bufferSize: 0.5 })).toThrow(/positive finite integer/);
		expect(() => profiler.start({ bufferSize: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
			/positive finite integer/,
		);
	});

	it('refreshes a canonical wrapper metadata source without adding function properties', () => {
		function Wrapper() {}
		function Initial() {}
		function Updated() {}
		__profileComponent(Initial, {
			id: 'src/Hmr.tsrx#App@1:0',
			name: 'App',
			file: 'src/Hmr.tsrx',
			line: 1,
			column: 0,
			kind: 'component',
		});
		__profileComponent(Updated, {
			id: 'src/Hmr.tsrx#App@4:0',
			name: 'App',
			file: 'src/Hmr.tsrx',
			line: 4,
			column: 0,
			kind: 'component',
		});
		const subject = {};
		__profileComponentSource(Wrapper, Initial);
		__profileTrackComponent(subject, Wrapper);
		let frame = __profileBeginRender(subject, Wrapper, false);
		__profileEndRender(frame, false);
		__profileComponentSource(Wrapper, Updated);
		frame = __profileBeginRender(subject, Wrapper, true);
		__profileEndRender(frame, false);

		expect(profiler.getEvents().map((event) => event.line)).toEqual([1, 4]);
		expect(Object.prototype.hasOwnProperty.call(Wrapper, '__profileSource')).toBe(false);
	});

	it('keeps same-named definitions isolated by exact component identity', () => {
		const Left = function Same() {};
		const Right = function Same() {};
		__profileComponent(Left, {
			id: 'src/Collision.tsrx#Same@2:1',
			name: 'Same',
			file: 'src/Collision.tsrx',
			line: 2,
			column: 1,
			kind: 'component',
		});
		__profileComponent(Right, {
			id: 'src/Collision.tsrx#Same@8:1',
			name: 'Same',
			file: 'src/Collision.tsrx',
			line: 8,
			column: 1,
			kind: 'component',
		});
		const leftSubject = {};
		const rightSubject = {};
		__profileTrackComponent(leftSubject, Left);
		__profileTrackComponent(rightSubject, Right);
		__profileEndRender(__profileBeginRender(leftSubject, Left, false), false);
		__profileEndRender(__profileBeginRender(rightSubject, Right, false), false);

		expect(
			profiler
				.summary()
				.map((entry) => entry.componentId)
				.sort(),
		).toEqual(['src/Collision.tsrx#Same@2:1', 'src/Collision.tsrx#Same@8:1']);
		expect(profiler.why(Left).map((event) => event.componentId)).toEqual([
			'src/Collision.tsrx#Same@2:1',
		]);
		expect(profiler.why(Right).map((event) => event.componentId)).toEqual([
			'src/Collision.tsrx#Same@8:1',
		]);
		expect(profiler.why('Same')).toHaveLength(2);
	});

	it('keeps pending direct causes for the actual render after an ancestor bailout', () => {
		function MemoRow() {}
		const slot = __profileHook(Symbol('row-state'), {
			id: 'src/Row.tsrx#MemoRow#hook:0',
			componentId: 'src/Row.tsrx#MemoRow',
			name: 'selected',
			kind: 'useState',
			file: 'src/Row.tsrx',
			line: 3,
			column: 12,
			index: 0,
		});
		const subject = {};
		__profileTrackComponent(subject, MemoRow);
		__profileSchedule(subject, 'state', slot);
		__profileBail(subject, MemoRow, 'memo-bailout');
		let frame = __profileBeginRender(subject, MemoRow, true);
		__profileEndRender(frame, false);
		const [bail, render] = profiler.getEvents();
		expect(bail.causes).toEqual([{ type: 'memo-bailout' }]);
		expect(render.causes).toEqual([
			{ type: 'state', hook: 'selected', source: 'src/Row.tsrx:3:12' },
		]);
	});
});
