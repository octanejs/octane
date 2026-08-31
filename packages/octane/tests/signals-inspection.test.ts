import { describe, expect, it } from 'vitest';
import { createScope, query } from 'octane/signals';
import { controlledStream, deferred, drainProducers } from './_fixtures/signals-async-controls';

describe('scoped signal inspection', () => {
	it('reports unevaluated nodes without running their computations', () => {
		const scope = createScope({ scopeKey: 'lazy-inspection' });
		let evaluated = false;
		const value$ = scope.derived$('value', () => {
			evaluated = true;
			return 1;
		});
		expect(scope.inspect().nodes).toMatchObject([
			{ key: 'value', kind: 'derived', status: 'unevaluated' },
		]);
		expect(evaluated).toBe(false);
		expect(value$.get()).toBe(1);
		expect(scope.inspect().nodes).toMatchObject([{ key: 'value', status: 'ready' }]);
		scope.dispose();
	});

	it('reports current dependency owners after a branch changes', () => {
		const shared = createScope({ scopeKey: 'shared-inspection' });
		const view = createScope({ scopeKey: 'view-inspection' });
		const remote$ = shared.signal$('remote', 1);
		const local$ = view.signal$('local', 2);
		const choose$ = view.signal$('choose', true);
		const result$ = view.derived$('result', () => (choose$.get() ? remote$.get() : local$.get()));
		expect(result$.get()).toBe(1);
		expect(view.inspect().nodes.find((node) => node.key === 'result')?.dependencies).toEqual([
			{ scopeKey: 'view-inspection', key: 'choose' },
			{ scopeKey: 'shared-inspection', key: 'remote' },
		]);
		choose$.set(false);
		expect(result$.get()).toBe(2);
		expect(view.inspect().nodes.find((node) => node.key === 'result')?.dependencies).toEqual([
			{ scopeKey: 'view-inspection', key: 'choose' },
			{ scopeKey: 'view-inspection', key: 'local' },
		]);
		view.dispose();
		expect(shared.inspect().nodes[0]?.subscribers).toBe(0);
		shared.dispose();
	});

	it('keeps tracing explicitly opt-in and bounded without retaining values or callbacks', () => {
		const quiet = createScope({ scopeKey: 'quiet' });
		const value$ = quiet.signal$('value', 0);
		value$.set(1);
		expect(quiet.inspect().trace).toEqual([]);
		const scope = createScope({ scopeKey: 'traced', debug: { traceLimit: 3 } });
		const secret$ = scope.signal$('secret', {
			secretPayload: 'never-in-inspection',
			callback() {},
		});
		for (let i = 0; i < 6; i++)
			secret$.set({ secretPayload: `never-in-inspection:${i}`, callback() {} });
		const inspection = scope.inspect();
		expect(inspection.trace).toHaveLength(3);
		expect(inspection.trace.map((event) => event.sequence)).toEqual([4, 5, 6]);
		expect(
			inspection.trace.every((event) => event.type === 'write' && event.key === 'secret'),
		).toBe(true);
		expect(JSON.stringify(inspection)).not.toContain('never-in-inspection');
		expect(JSON.stringify(inspection)).not.toContain('callback');
		quiet.dispose();
		expect(quiet.inspect().trace).toEqual([]);
		scope.dispose();
	});

	it('keeps bounded trace history chronological across writes and retirement', () => {
		const scope = createScope({ scopeKey: 'trace-order', debug: { traceLimit: 3 } });
		const value$ = scope.signal$('value', 0);
		value$.set(1);
		value$.set(2);
		value$.set(3);
		expect(scope.inspect().trace.map((event) => event.sequence)).toEqual([1, 2, 3]);
		value$.set(4);
		expect(scope.inspect().trace.map((event) => event.sequence)).toEqual([2, 3, 4]);
		value$.set(5);
		value$.set(6);
		expect(scope.inspect().trace.map((event) => event.sequence)).toEqual([4, 5, 6]);
		scope.dispose();
		expect(scope.inspect().trace).toEqual([
			{ sequence: 5, type: 'write', key: 'value', revision: 5 },
			{ sequence: 6, type: 'write', key: 'value', revision: 6 },
			{ sequence: 7, type: 'retire' },
		]);
	});

	it('retains only the latest traced event with a one-event budget', () => {
		const scope = createScope({ scopeKey: 'single-trace-event', debug: { traceLimit: 1 } });
		const value$ = scope.signal$('value', 0);
		value$.set(1);
		value$.set(2);
		expect(scope.inspect().trace).toEqual([
			{ sequence: 2, type: 'write', key: 'value', revision: 2 },
		]);
		scope.dispose();
		expect(scope.inspect().trace).toEqual([{ sequence: 3, type: 'retire' }]);
	});

	it('reports request activity and independent historical leases through retirement', async () => {
		const pending = deferred<string>();
		const scope = createScope({ scopeKey: 'lifetime-inspection' });
		const load = query('load', () => pending.promise);
		scope.asyncSignal$('result', () => load(undefined));
		expect(scope.inspect()).toMatchObject({ activeRequests: 1, adoptionLeases: 0, retired: false });
		pending.resolve('ready');
		await drainProducers();
		expect(scope.inspect().activeRequests).toBe(0);
		const frame = scope.beginAdoption(scope.serialize());
		const retained = frame.retain();
		expect(scope.inspect().adoptionLeases).toBe(2);
		frame.release();
		expect(scope.inspect().adoptionLeases).toBe(1);
		scope.dispose();
		expect(retained.released).toBe(true);
		expect(scope.inspect()).toMatchObject({
			activeRequests: 0,
			adoptionLeases: 0,
			retired: true,
			epoch: 1,
			nodes: [],
		});
	});

	it('does not expose mutable trace records to an inspection consumer', () => {
		const scope = createScope({ scopeKey: 'inspection-copy', debug: { traceLimit: 2 } });
		const value$ = scope.signal$('value', 0);
		value$.set(1);
		value$.set(2);
		value$.set(3);
		const first = scope.inspect();
		for (const event of first.trace) Object.assign(event, { key: 'tampered', revision: -1 });
		expect(scope.inspect().trace).toEqual([
			{ sequence: 2, type: 'write', key: 'value', revision: 2 },
			{ sequence: 3, type: 'write', key: 'value', revision: 3 },
		]);
		scope.dispose();
	});

	it('reports stream activity and retained quiet refresh without exposing payloads', async () => {
		const first = controlledStream<string>();
		const second = controlledStream<string>();
		const scope = createScope({ scopeKey: 'stream-inspection' });
		let attempt = 0;
		const load = query('stream', () => (attempt++ === 0 ? first : second).iterable, {
			kind: 'stream',
		});
		const value$ = scope.asyncSignal$('value', () => load(undefined));
		try {
			expect(scope.inspect().nodes[0]).toMatchObject({
				status: 'pending',
				retained: false,
				refreshing: false,
				connection: 'connecting',
				complete: false,
			});
			first.emit('private-payload');
			await drainProducers();
			expect(scope.inspect().nodes[0]).toMatchObject({
				status: 'ready',
				retained: true,
				refreshing: false,
				connection: 'open',
				complete: false,
			});
			value$.retry();
			expect(scope.inspect().nodes[0]).toMatchObject({
				status: 'ready',
				retained: true,
				refreshing: true,
				connection: 'connecting',
				complete: false,
			});
			second.emit('replacement-payload');
			second.end();
			await drainProducers();
			expect(scope.inspect().nodes[0]).toMatchObject({
				status: 'ready',
				retained: true,
				refreshing: false,
				connection: 'closed',
				complete: true,
			});
			expect(JSON.stringify(scope.inspect())).not.toContain('payload');
		} finally {
			scope.dispose();
		}
	});

	it('releases subscription accounting after repeated cleanup and owner disposal', () => {
		const scope = createScope({ scopeKey: 'subscriptions' });
		const value$ = scope.signal$('value', 1);
		const first = value$.subscribe(() => {});
		const second = value$.subscribe(() => {});
		expect(scope.inspect().nodes[0]?.subscribers).toBe(2);
		first();
		first();
		expect(scope.inspect().nodes[0]?.subscribers).toBe(1);
		second();
		expect(scope.inspect().nodes[0]?.subscribers).toBe(0);
		scope.dispose();
		expect(scope.inspect().nodes).toEqual([]);
	});

	it.each([-1, 0.5, 10001, Number.NaN])('rejects an invalid trace budget %s', (traceLimit) => {
		expect(() => createScope({ scopeKey: 'invalid-trace', debug: { traceLimit } })).toThrow(
			RangeError,
		);
	});
});
