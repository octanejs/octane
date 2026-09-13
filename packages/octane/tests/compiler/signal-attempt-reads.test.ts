import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import * as Signals from 'octane/signals';
import { loadCompiledFixtureSource } from '../_server-fixture';
import { deferred, drainProducers } from '../_fixtures/signals-async-controls';

function client(source: string) {
	return compile(source, '/src/signal-attempts.tsrx', { hmr: false }).code;
}

describe('attempt-bound signal reads', () => {
	it('binds a keyed expression-bodied async computation to its owner', async () => {
		const { count$, result$ } = loadCompiledFixtureSource(
			`
			import { signal$, derived$ } from 'octane/signals';
			export const count$ = signal$(7);
			export const result$ = derived$('expression', async () => (await Promise.resolve(), count$.get()));
		`,
			{
				id: '/src/expression-attempt.tsrx',
				mode: 'client',
				runtimeModules: { 'octane/signals': Signals },
			},
		);
		const scope = Signals.createScope({ scopeKey: 'expression-attempt' });
		try {
			Signals.runWithSignalOwner(scope, () => count$.set(9));
			Signals.runWithSignalOwner(scope, () => result$.snapshot());
			await drainProducers();
			expect(Signals.runWithSignalOwner(scope, () => result$.snapshot())).toMatchObject({
				status: 'ready',
				value: 9,
			});
			Signals.runWithSignalOwner(scope, () => count$.set(10));
			await drainProducers();
			expect(Signals.runWithSignalOwner(scope, () => result$.snapshot())).toMatchObject({
				status: 'ready',
				value: 10,
			});
		} finally {
			scope.dispose();
		}
	});

	for (const hmr of [false, true]) {
		it.each([
			['keyed', "'answer', async () => { await Promise.resolve();"],
			['conditional statement', 'async () => { if (true) await Promise.resolve();'],
			['conditional expression', 'async () => { true ? await Promise.resolve() : null;'],
			['untaken await', 'async () => { if (false) await Promise.resolve();'],
		])(
			`keeps %s reads owned and invalidates stale attempts (hmr=${hmr})`,
			async (_name, callback) => {
				const gate = deferred<void>();
				const fixture = loadCompiledFixtureSource(
					`
				import { signal$, derived$ } from 'octane/signals';
				import { gate } from './gate';
				export const count$ = signal$(1);
				export const result$ = derived$(${callback}
					const value = count$.get(); await gate; return value;
				});
			`,
					{
						id: '/src/attempt-owner.tsrx',
						mode: 'client',
						compileOptions: { hmr },
						runtimeModules: { 'octane/signals': Signals, './gate': { gate: gate.promise } },
					},
				);
				const scope = Signals.createScope({ scopeKey: 'compiled-attempt' });
				try {
					Signals.runWithSignalOwner(scope, () => fixture.result$.snapshot());
					await drainProducers();
					Signals.runWithSignalOwner(scope, () => fixture.count$.set(2));
					gate.resolve();
					await drainProducers();
					expect(Signals.runWithSignalOwner(scope, () => fixture.result$.snapshot())).toMatchObject(
						{ status: 'ready', value: 2 },
					);
				} finally {
					scope.dispose();
				}
			},
		);
	}

	it.each([
		[
			'unused argument',
			'function read$(value$, unused) { return value$.get(); }',
			'read$(count$, effect())',
		],
		[
			'default parameter',
			'function read$(value$, unused = effect()) { return value$.get(); }',
			'read$(count$)',
		],
		[
			'closed-over helper argument',
			'function read$(unused) { return count$.get(); }',
			'read$(effect())',
		],
	])('rejects unproven helper inlining with %s', (_name, helper, call) => {
		expect(() =>
			client(`
			import { signal$, derived$ } from 'octane/signals';
			const count$ = signal$(1);
			${helper}
			export const result$ = derived$(async () => {
				await Promise.resolve(); return ${call};
			});
		`),
		).toThrow(/helper.*explicitly|helper.*cannot be proven/);
	});

	it('rewrites only direct reads reached after await', () => {
		const code = client(`
			import { signal$, derived$ } from 'octane/signals';
			const count$ = signal$(1);
			export const result$ = derived$(async () => {
				const before = count$.get();
				await pause();
				return before + count$.get();
			});
		`);
		expect(code).toContain('const before = count$.get()');
		expect(code).toMatch(/await\s+_\$signalContext\.read\(count\$\)/);
	});

	it('recognizes a trusted namespace derived factory', () => {
		const code = client(`
			import * as signals from 'octane/signals';
			const count$ = signals.signal$(1);
			export const result$ = signals.derived$(async () => {
				await pause();
				return count$.get();
			});
		`);
		expect(code).toMatch(/await\s+_\$signalContext\.read\(count\$\)/);
	});

	it('inlines proven local direct-read helpers into the attempt reader', () => {
		const code = client(`
			import { signal$, derived$ } from 'octane/signals';
			const count$ = signal$(1);
			const readSignal$ = (value$) => value$.get();
			export const result$ = derived$(async ({ signal }) => {
				await pause(signal);
				return readSignal$(count$);
			});
		`);
		expect(code).toMatch(/await\s+_\$signalRead\(count\$\)/);
		expect(code).toContain('read: _$signalRead');
	});

	it('requires the explicit reader for opaque post-await helper calls', () => {
		expect(() =>
			client(`
				import { signal$, derived$ } from 'octane/signals';
				import { inspectSignal } from './opaque';
				const count$ = signal$(1);
				export const result$ = derived$(async () => {
					await pause();
					return inspectSignal(count$);
				});
			`),
		).toThrow(/opaque helper.*Pass the derived context `read`/);
	});

	it('accepts an explicitly passed attempt reader for opaque helpers', () => {
		expect(() =>
			client(`
				import { signal$, derived$ } from 'octane/signals';
				import { inspectSignal } from './opaque';
				const count$ = signal$(1);
				export const result$ = derived$(async ({ read }) => {
					await pause();
					return inspectSignal(count$, read);
				});
			`),
		).not.toThrow();
	});
});
