import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	__profileBeginRender,
	__profileComponent,
	__profileComponentSource,
	__profileEndRender,
	__profileHook,
	__profileSchedule,
	__profileTrackComponent,
	profiler,
	type ComponentProfileMetadata,
} from '../src/profiling';

function metadata(
	name: string,
	line = 1,
	id = `src/Profile.tsrx#${name}@${line}:0`,
): ComponentProfileMetadata {
	return {
		id,
		name,
		file: 'src/Profile.tsrx',
		line,
		column: 0,
		kind: 'component',
	};
}

function register<T extends Function>(component: T, details = metadata(component.name)): T {
	return __profileComponent(component, details);
}

function track(component: Function): object {
	const subject = {};
	__profileTrackComponent(subject, component);
	return subject;
}

function record(subject: object, component: Function, mounted = false): void {
	const frame = __profileBeginRender(subject, component, mounted);
	__profileEndRender(frame, false);
}

beforeEach(() => {
	profiler.clear();
	profiler.start({ bufferSize: 10_000, timeline: false });
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('profiler event buffer', () => {
	it('reports inclusive and self time for nested component work', () => {
		function Parent() {}
		function Child() {}
		register(Parent);
		register(Child);
		const parent = track(Parent);
		const child = track(Child);
		vi.spyOn(performance, 'now')
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(2)
			.mockReturnValueOnce(5)
			.mockReturnValueOnce(8);

		const parentFrame = __profileBeginRender(parent, Parent, false);
		const childFrame = __profileBeginRender(child, Child, false);
		__profileEndRender(childFrame, false);
		__profileEndRender(parentFrame, false);

		expect(profiler.why(Child)[0]).toMatchObject({ duration: 3, selfDuration: 3 });
		expect(profiler.why(Parent)[0]).toMatchObject({ duration: 8, selfDuration: 5 });
	});

	it('retains the newest events when the buffer fills or shrinks', () => {
		function Row() {}
		register(Row);
		const row = track(Row);
		profiler.start({ bufferSize: 3 });

		for (let index = 0; index < 5; index++) record(row, Row, true);
		expect(profiler.getEvents().map((event) => event.attempt)).toEqual([3, 4, 5]);

		profiler.start({ bufferSize: 2 });
		expect(profiler.getEvents().map((event) => event.attempt)).toEqual([4, 5]);

		record(row, Row, true);
		expect(profiler.getEvents().map((event) => event.attempt)).toEqual([5, 6]);
	});

	it('rejects invalid buffer sizes', () => {
		for (const bufferSize of [0, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => profiler.start({ bufferSize })).toThrow(RangeError);
		}
	});

	it('discards a render that is still in flight when recording stops', () => {
		function Row() {}
		register(Row);
		const row = track(Row);
		const frame = __profileBeginRender(row, Row, false);

		profiler.stop();
		__profileEndRender(frame, false);

		expect(profiler.getEvents()).toEqual([]);
	});

	it('does not carry a queued cause into a new recording session', () => {
		function Row() {}
		register(Row);
		const row = track(Row);
		__profileSchedule(row, 'state');

		profiler.stop();
		profiler.start({ timeline: false });
		record(row, Row, true);

		expect(profiler.why(Row)[0]).toMatchObject({
			scheduled: false,
			causes: [{ type: 'unknown' }],
		});
	});

	it('does not charge Chrome track emission to a parent component', () => {
		function Parent() {}
		function Child() {}
		register(Parent);
		register(Child);
		const parent = track(Parent);
		const child = track(Child);
		let clock = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => clock);
		const timestamp = vi.fn(() => {
			clock += 100;
		});
		vi.stubGlobal('console', { timeStamp: timestamp });
		profiler.start({ timeline: true });

		const parentFrame = __profileBeginRender(parent, Parent, false);
		clock = 2;
		const childFrame = __profileBeginRender(child, Child, false);
		clock = 5;
		__profileEndRender(childFrame, false);
		clock = 8;
		__profileEndRender(parentFrame, false);

		expect(timestamp).toHaveBeenCalledTimes(2);
		expect(timestamp.mock.calls.map(([label]) => label)).toEqual(
			expect.arrayContaining(['Child (mount)', 'Parent (mount)']),
		);
		expect(profiler.why(Parent)[0]).toMatchObject({ duration: 8, selfDuration: 5 });
	});
});

describe('profiler queries', () => {
	it('keeps same-named component definitions separate by identity', () => {
		const Left = register(function Same() {}, metadata('Same', 2, 'src/Left.tsrx#Same'));
		const Right = register(function Same() {}, metadata('Same', 8, 'src/Right.tsrx#Same'));
		record(track(Left), Left);
		record(track(Right), Right);

		expect(profiler.why(Left)).toHaveLength(1);
		expect(profiler.why(Left)[0].componentId).toBe('src/Left.tsrx#Same');
		expect(profiler.why(Right)).toHaveLength(1);
		expect(profiler.why('Same')).toHaveLength(2);
		expect(profiler.summary()).toHaveLength(2);
	});

	it('includes zero-delay scheduled updates in queue-delay averages', () => {
		function Row() {}
		register(Row);
		const row = track(Row);
		let clock = 10;
		vi.spyOn(performance, 'now').mockImplementation(() => clock);

		record(row, Row);
		clock = 20;
		__profileSchedule(row, 'state');
		record(row, Row, true);
		clock = 30;
		__profileSchedule(row, 'state');
		clock = 35;
		record(row, Row, true);

		expect(profiler.why(Row)[1]).toMatchObject({ scheduled: true, queueDelay: 0 });
		expect(profiler.summary()[0]).toMatchObject({
			component: 'Row',
			attempts: 3,
			completed: 3,
			averageQueueDelay: 2.5,
		});
	});

	it('exports an independent Chrome trace snapshot', () => {
		function Row() {}
		register(Row);
		const row = track(Row);
		const slot = __profileHook(Symbol('count'), {
			id: 'src/Profile.tsrx#Row#hook:0',
			componentId: 'src/Profile.tsrx#Row@1:0',
			name: 'count',
			kind: 'useState',
			file: 'src/Profile.tsrx',
			line: 2,
			column: 12,
			index: 0,
		});
		__profileSchedule(row, 'state', slot);
		record(row, Row, true);

		const trace = profiler.exportTrace();
		expect(trace.traceEvents[0]).toMatchObject({
			name: 'Row (update)',
			cat: 'octane.component',
			ph: 'X',
			args: {
				outcome: 'completed',
				causes: [{ type: 'state', hook: 'count', source: 'src/Profile.tsrx:2:12' }],
			},
		});

		const exportedCauses = trace.traceEvents[0].args.causes as Array<{ type: string }>;
		exportedCauses[0].type = 'changed';
		expect(profiler.why(Row)[0].causes[0].type).toBe('state');
	});
});

describe('profiling metadata ABI', () => {
	it('labels an anonymous compiled component without replacing it', () => {
		const component = () => {};
		Object.defineProperty(component, 'name', { value: '', configurable: true });

		expect(register(component, metadata('Anonymous'))).toBe(component);
		expect(component.name).toBe('Anonymous');
	});

	it('uses the latest source metadata forwarded by an HMR wrapper', () => {
		function Wrapper() {}
		function Initial() {}
		function Updated() {}
		register(Initial, metadata('App', 1));
		register(Updated, metadata('App', 4));
		const subject = track(Wrapper);

		__profileComponentSource(Wrapper, Initial);
		record(subject, Wrapper);
		__profileComponentSource(Wrapper, Updated);
		record(subject, Wrapper, true);

		expect(
			profiler
				.getEvents()
				.filter((event) => event.component === 'App')
				.map((event) => event.line),
		).toEqual([1, 4]);
	});
});
