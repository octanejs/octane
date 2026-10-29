import {
	act,
	createElement as h,
	Suspense as ReactSuspense,
	useContext as useReactContext,
} from 'react';
import { createRoot as createReactRoot, type Root as ReactRoot } from 'react-dom/client';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRef from 'effect/reactivity/AtomRef';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act as octaneAct, createRoot, flushSync, type Root } from 'octane';
import { flushEffects } from '../../../octane/tests/_helpers';
import * as Upstream from '../../upstream/src/index.ts';
import * as Probes from '../_fixtures/probes.tsrx';

// Every case drives the pinned React @effect/atom-react and the Octane port
// through the same steps and records what a caller can observe after each one:
// the rendered text, the values and promises the hooks hand back, and the atom
// lifecycle in the registry. The upstream suite does not exercise these hooks.

type Report = (value: any) => void;
type ProbeName = keyof typeof ReactProbes;

const ReactProbes = {
	UseAtom: ({ atom, report }: { atom: Atom.Writable<number>; report: Report }) => {
		const [value, set] = Upstream.useAtom(atom);
		report(set);
		return h('span', null, String(value));
	},
	UseAtomSet: ({
		atom,
		mode,
		report,
	}: {
		atom: Atom.Writable<any, any>;
		mode: any;
		report: Report;
	}) => {
		report(Upstream.useAtomSet(atom, { mode }));
		return h('span', null, String(Upstream.useAtomValue(atom)._tag));
	},
	UseAtomMount: ({ atom }: { atom: Atom.Atom<unknown> }) => {
		Upstream.useAtomMount(atom);
		return null;
	},
	UseAtomRefresh: ({ atom, report }: { atom: Atom.Atom<number>; report: Report }) => {
		report(Upstream.useAtomRefresh(atom));
		return h('span', null, String(Upstream.useAtomValue(atom)));
	},
	UseAtomSubscribe: (props: {
		atom: Atom.Atom<number>;
		f: (value: number) => void;
		immediate: boolean;
	}) => {
		Upstream.useAtomSubscribe(props.atom, props.f, { immediate: props.immediate });
		return null;
	},
	UseAtomInitialValues: ({ atom, value }: { atom: Atom.Writable<number>; value: number }) => {
		Upstream.useAtomInitialValues([[atom, value]]);
		return h('span', null, String(Upstream.useAtomValue(atom)));
	},
	UseAtomRefProp: ({
		source,
		report,
	}: {
		source: AtomRef.AtomRef<{ count: number; label: string }>;
		report: Report;
	}) => {
		report(Upstream.useAtomRefProp(source, 'count'));
		return h(
			'span',
			null,
			Upstream.useAtomRefPropValue(source, 'label') +
				':' +
				String(Upstream.useAtomRefPropValue(source, 'count')),
		);
	},
	Provider: (props: {
		atom: Atom.Writable<number>;
		value: number;
		scheduleTask: any;
		report: Report;
	}) =>
		h(
			Upstream.RegistryProvider,
			{ initialValues: [[props.atom, props.value]], scheduleTask: props.scheduleTask },
			h(ReactProvidedValue, props),
		),
	UseAtomSuspense: (props: {
		atom: Atom.Atom<AsyncResult.AsyncResult<number, string>>;
		suspendOnWaiting: boolean;
	}) => h(ReactSuspense, { fallback: h('span', null, 'fallback') }, h(ReactSuspendedResult, props)),
};

function ReactProvidedValue({ atom, report }: { atom: Atom.Atom<number>; report: Report }) {
	report(useReactContext(Upstream.RegistryContext));
	return h('span', null, String(Upstream.useAtomValue(atom)));
}

function ReactSuspendedResult(props: {
	atom: Atom.Atom<AsyncResult.AsyncResult<number, string>>;
	suspendOnWaiting: boolean;
}) {
	const result = Upstream.useAtomSuspense(props.atom, {
		suspendOnWaiting: props.suspendOnWaiting,
		includeFailure: true,
	});
	return h(
		'span',
		null,
		result._tag +
			':' +
			String(result._tag === 'Success' ? result.value : '') +
			':' +
			String(result.waiting),
	);
}

interface Side {
	render(probe: ProbeName, props: object): void;
	step(run: () => unknown): void;
	/** Let scheduled host tasks, timers and promises run, then flush renders. */
	settle(): Promise<void>;
	text(): string;
	unmount(): void;
}

const tasks = async () => {
	for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function react(registry: AtomRegistry.AtomRegistry): Side {
	const container = document.body.appendChild(document.createElement('div'));
	let root: ReactRoot | undefined;
	return {
		render(probe, props) {
			root ??= createReactRoot(container);
			act(() =>
				root!.render(
					h(
						Upstream.RegistryContext.Provider,
						{ value: registry },
						h(ReactProbes[probe] as any, props),
					),
				),
			);
		},
		step: (run) => act(() => void run()),
		settle: () => act(tasks),
		text: () => container.textContent ?? '',
		unmount() {
			act(() => root!.unmount());
			container.remove();
		},
	};
}

function octane(registry: AtomRegistry.AtomRegistry): Side {
	const container = document.body.appendChild(document.createElement('div'));
	let root: Root | undefined;
	const flush = () => {
		for (let pass = 0; pass < 3; pass++) flushEffects();
	};
	return {
		render(probe, props) {
			root ??= createRoot(container);
			root.render(Probes.InRegistry, { registry, probe: Probes[probe], props });
			flush();
		},
		step(run) {
			flushSync(() => void run());
			flush();
		},
		// Inside act(), as React's side is, so a Suspense retry reveals without
		// waiting out the fallback window.
		async settle() {
			await octaneAct(tasks);
			flush();
		},
		text: () => container.textContent ?? '',
		unmount() {
			root!.unmount();
			container.remove();
		},
	};
}

/** Run `scenario` on both implementations and return the React observations after checking Octane's match. */
async function differential<T>(
	scenario: (create: (registry: AtomRegistry.AtomRegistry) => Side) => Promise<T>,
) {
	const expected = await scenario(react);
	const actual = await scenario(octane);
	expect(actual).toEqual(expected);
	return expected;
}

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/effect-atom against @effect/atom-react 4.1.0', () => {
	// @parity-case differential:effect-atom-use-atom
	it('useAtom renders the value and writes values and updaters', async () => {
		const observed = await differential(async (create) => {
			const side = create(AtomRegistry.make());
			const atom = Atom.make(1);
			let set!: (value: number | ((value: number) => number)) => void;
			const log: string[] = [];
			side.render('UseAtom', { atom, report: (value: typeof set) => (set = value) });
			log.push(side.text());
			side.step(() => set(5));
			log.push(side.text());
			side.step(() => set((value) => value * 2));
			log.push(side.text());
			side.unmount();
			return log;
		});
		expect(observed).toEqual(['1', '5', '10']);
	});

	// @parity-case differential:effect-atom-use-atom-set-promise
	it('useAtomSet resolves promise and promiseExit writes with the next settled result', async () => {
		const observed = await differential(async (create) => {
			const side = create(AtomRegistry.make());
			const double = Atom.fn((n: number) =>
				n < 0 ? Effect.fail('negative') : Effect.succeed(n * 2),
			);
			const log: unknown[] = [];
			let write!: (value: number) => Promise<any>;
			side.render('UseAtomSet', {
				atom: double,
				mode: 'promise',
				report: (value: typeof write) => (write = value),
			});
			log.push(side.text());
			let pending!: Promise<any>;
			side.step(() => (pending = write(21)));
			log.push(await pending, side.text());
			side.step(() => (pending = write(-1).catch((error) => `rejected:${String(error)}`)));
			log.push(await pending);
			side.render('UseAtomSet', {
				atom: double,
				mode: 'promiseExit',
				report: (value: typeof write) => (write = value),
			});
			side.step(() => (pending = write(4)));
			const success = await pending;
			side.step(() => (pending = write(-4)));
			const failure = await pending;
			log.push(
				Exit.isSuccess(success) ? success.value : 'failure',
				Exit.isFailure(failure) ? Cause.squash(failure.cause) : 'success',
			);
			side.unmount();
			return log;
		});
		expect(observed).toEqual(['Initial', 42, 'Success', 'rejected:negative', 8, 'negative']);
	});

	// @parity-case differential:effect-atom-use-atom-mount
	it('useAtomMount keeps an atom built while mounted and releases it after unmount', async () => {
		const observed = await differential(async (create) => {
			const registry = AtomRegistry.make();
			const side = create(registry);
			let built = 0;
			let released = 0;
			const resource = Atom.make((get) => {
				built++;
				get.addFinalizer(() => {
					released++;
				});
				return built;
			});
			side.render('UseAtomMount', { atom: resource });
			await side.settle();
			const mounted = [built, released];
			side.unmount();
			await side.settle();
			return [mounted, [built, released]];
		});
		expect(observed).toEqual([
			[1, 0],
			[1, 1],
		]);
	});

	// @parity-case differential:effect-atom-use-atom-refresh
	it('useAtomRefresh reruns the atom and rerenders its readers', async () => {
		const observed = await differential(async (create) => {
			const side = create(AtomRegistry.make());
			let reads = 0;
			const counter = Atom.make(() => ++reads);
			let refresh!: () => void;
			side.render('UseAtomRefresh', {
				atom: counter,
				report: (value: typeof refresh) => (refresh = value),
			});
			const log = [side.text()];
			side.step(() => refresh());
			log.push(side.text());
			side.step(() => refresh());
			log.push(side.text());
			side.unmount();
			return log;
		});
		expect(observed).toEqual(['1', '2', '3']);
	});

	// @parity-case differential:effect-atom-use-atom-subscribe
	it('useAtomSubscribe calls back for changes, immediately when asked, until unmount', async () => {
		const observed = await differential(async (create) => {
			const log: Record<string, number[]> = {};
			for (const immediate of [true, false]) {
				const registry = AtomRegistry.make();
				const side = create(registry);
				const atom = Atom.make(0);
				const calls: number[] = (log[String(immediate)] = []);
				side.render('UseAtomSubscribe', {
					atom,
					f: (value: number) => calls.push(value),
					immediate,
				});
				side.step(() => registry.set(atom, 1));
				side.unmount();
				registry.set(atom, 2);
			}
			return log;
		});
		expect(observed).toEqual({ true: [0, 1], false: [1] });
	});

	// @parity-case differential:effect-atom-use-atom-initial-values
	it('useAtomInitialValues seeds each atom once per registry', async () => {
		const observed = await differential(async (create) => {
			const side = create(AtomRegistry.make());
			const atom = Atom.make(0);
			side.render('UseAtomInitialValues', { atom, value: 5 });
			const log = [side.text()];
			side.render('UseAtomInitialValues', { atom, value: 9 });
			log.push(side.text());
			side.unmount();
			return log;
		});
		expect(observed).toEqual(['5', '5']);
	});

	// @parity-case differential:effect-atom-atom-ref-prop
	it('useAtomRefProp memoizes the property ref and useAtomRefPropValue follows it', async () => {
		const observed = await differential(async (create) => {
			const side = create(AtomRegistry.make());
			const source = AtomRef.make({ count: 1, label: 'a' });
			const refs: AtomRef.AtomRef<number>[] = [];
			side.render('UseAtomRefProp', {
				source,
				report: (ref: AtomRef.AtomRef<number>) => refs.push(ref),
			});
			const log: unknown[] = [side.text()];
			side.step(() => refs.at(-1)!.set(2));
			log.push(side.text());
			side.step(() => source.update((value) => ({ ...value, label: 'b' })));
			log.push(
				side.text(),
				refs.every((ref) => ref === refs[0]),
			);
			side.unmount();
			return log;
		});
		expect(observed).toEqual(['a:1', 'a:2', 'b:2', true]);
	});

	// @parity-case differential:effect-atom-registry-provider
	it('RegistryProvider seeds a registry it owns and disposes it 500 ms after unmount', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const observed = await differential(async (create) => {
			const side = create(AtomRegistry.make());
			// Kept alive, its node outlives its reader and leaves only on dispose.
			const atom = Atom.make(0).pipe(Atom.keepAlive);
			const registries: AtomRegistry.AtomRegistry[] = [];
			const scheduleTask = (f: () => void) => {
				const timeout = setTimeout(f, 0);
				return () => clearTimeout(timeout);
			};
			side.render('Provider', {
				atom,
				value: 7,
				scheduleTask,
				report: (r: AtomRegistry.AtomRegistry) => registries.push(r),
			});
			const registry = registries[0]!;
			const log: unknown[] = [
				side.text(),
				registries.every((r) => r === registry),
				registry.getNodes().size > 0,
			];
			side.unmount();
			vi.advanceTimersByTime(499);
			log.push(registry.getNodes().size > 0);
			vi.advanceTimersByTime(1);
			log.push(registry.getNodes().size);
			return log;
		});
		expect(observed).toEqual(['7', true, true, true, 0]);
	});

	// @parity-case differential:effect-atom-use-atom-suspense
	it('useAtomSuspense suspends while initial, and while waiting when asked, then returns the result', async () => {
		const observed = await differential(async (create) => {
			const log: Record<string, string[]> = {};
			for (const suspendOnWaiting of [false, true]) {
				const registry = AtomRegistry.make();
				const side = create(registry);
				const atom = Atom.make(AsyncResult.initial<number, string>());
				const texts: string[] = (log[String(suspendOnWaiting)] = []);
				side.render('UseAtomSuspense', { atom, suspendOnWaiting });
				texts.push(side.text());
				side.step(() => registry.set(atom, AsyncResult.success(1)));
				await side.settle();
				texts.push(side.text());
				side.step(() => registry.set(atom, AsyncResult.success(2, { waiting: true })));
				await side.settle();
				texts.push(side.text());
				side.step(() => registry.set(atom, AsyncResult.fail('boom')));
				await side.settle();
				texts.push(side.text());
				side.unmount();
			}
			return log;
		});
		expect(observed).toEqual({
			false: ['fallback', 'Success:1:false', 'Success:2:true', 'Failure::false'],
			// A revealed boundary that suspends again hides its content beside the fallback.
			true: ['fallback', 'Success:1:false', 'Success:1:falsefallback', 'Failure::false'],
		});
	});
});
