import * as Effect from 'effect/Effect';
import type * as Exit from 'effect/Exit';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRef from 'effect/reactivity/AtomRef';
import type * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type * as Hydration from 'effect/reactivity/Hydration';
import type { Context, FC, OctaneNode } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import {
	HydrationBoundary,
	RegistryContext,
	RegistryProvider,
	TypeId,
	make,
	scheduleTask,
	useAtom,
	useAtomInitialValues,
	useAtomMount,
	useAtomRef,
	useAtomRefProp,
	useAtomRefPropValue,
	useAtomRefresh,
	useAtomSet,
	useAtomSubscribe,
	useAtomSuspense,
	useAtomValue,
	type HydrationBoundaryProps,
	type ScopedAtom,
} from '@octanejs/effect-atom-react';
import * as Hooks from '@octanejs/effect-atom-react/Hooks';
import * as ReactHydration from '@octanejs/effect-atom-react/ReactHydration';
import * as RegistryContextModule from '@octanejs/effect-atom-react/RegistryContext';
import * as ScopedAtomModule from '@octanejs/effect-atom-react/ScopedAtom';

const count = Atom.make(1);
const label = Atom.make((get) => String(get(count)));
const double = Atom.fn((n: number) => Effect.succeed(n * 2));
const result = Atom.make(AsyncResult.initial<number, string>());
const ref = AtomRef.make({ count: 1, label: 'a' });
const scoped = make(() => Atom.make(0));
const scopedWithInput = make((name: string) => Atom.make(name));

const value = useAtomValue(count);
const selected = useAtomValue(count, (n) => n > 0);
const [current, setCount] = useAtom(count);
const setDouble = useAtomSet(double, { mode: 'promise' });
const setDoubleExit = useAtomSet(double, { mode: 'promiseExit' });
const refresh = useAtomRefresh(label);
const success = useAtomSuspense(result);
const settled = useAtomSuspense(result, { includeFailure: true });
const countRef = useAtomRefProp(ref, 'count');

setCount(2);
setCount((previous) => previous + 1);
useAtomMount(label);
useAtomSubscribe(count, (next) => next.toFixed(), { immediate: true });
useAtomInitialValues([[count, 5]]);

export type Checks = [
	Assert<Equal<typeof value, number>>,
	Assert<Equal<typeof selected, boolean>>,
	Assert<Equal<typeof current, number>>,
	Assert<Equal<typeof setCount, (value: number | ((value: number) => number)) => void>>,
	Assert<
		Equal<Parameters<typeof setDouble>[0], number | typeof Atom.Reset | typeof Atom.Interrupt>
	>,
	Assert<Equal<ReturnType<typeof setDouble>, Promise<number>>>,
	Assert<Equal<ReturnType<typeof setDoubleExit>, Promise<Exit.Exit<number, never>>>>,
	Assert<Equal<typeof refresh, () => void>>,
	Assert<Equal<typeof success, AsyncResult.Success<number, string>>>,
	Assert<
		Equal<typeof settled, AsyncResult.Success<number, string> | AsyncResult.Failure<number, string>>
	>,
	Assert<Equal<typeof countRef, AtomRef.AtomRef<number>>>,
	Assert<Equal<ReturnType<typeof useAtomRef<string>>, string>>,
	Assert<Equal<ReturnType<typeof useAtomRefPropValue<{ label: string }, 'label'>>, string>>,
	Assert<Equal<ReturnType<typeof useAtomMount>, void>>,
	Assert<Equal<ReturnType<typeof useAtomSubscribe>, void>>,
	Assert<Equal<ReturnType<typeof useAtomInitialValues>, void>>,
	Assert<Equal<typeof RegistryContext, Context<AtomRegistry.AtomRegistry>>>,
	Assert<Equal<ReturnType<typeof RegistryProvider>, OctaneNode>>,
	Assert<
		Equal<
			Parameters<typeof RegistryProvider>[0]['initialValues'],
			Iterable<readonly [Atom.Atom<any>, any, Atom.InitialValueOptions?]> | undefined
		>
	>,
	Assert<Equal<typeof scheduleTask, (f: () => void) => () => void>>,
	Assert<Equal<typeof HydrationBoundary, FC<HydrationBoundaryProps>>>,
	Assert<Equal<HydrationBoundaryProps['state'], Iterable<Hydration.DehydratedAtom> | undefined>>,
	Assert<Equal<typeof TypeId, '~@effect/atom-react/ScopedAtom'>>,
	Assert<Equal<ReturnType<typeof scoped.use>, Atom.Writable<number>>>,
	Assert<Equal<typeof scoped, ScopedAtom<Atom.Writable<number>>>>,
	Assert<Equal<typeof scoped.Provider, FC<{ readonly children?: OctaneNode | undefined }>>>,
	Assert<
		Equal<
			typeof scopedWithInput.Provider,
			FC<{ readonly children?: OctaneNode | undefined; readonly value: string }>
		>
	>,
	Assert<Equal<typeof scoped.Context, Context<Atom.Writable<number>>>>,
	Assert<Equal<typeof Hooks.useAtomValue, typeof useAtomValue>>,
	Assert<Equal<typeof RegistryContextModule.RegistryProvider, typeof RegistryProvider>>,
	Assert<Equal<typeof ReactHydration.HydrationBoundary, typeof HydrationBoundary>>,
	Assert<Equal<typeof ScopedAtomModule.make, typeof make>>,
];

// @ts-expect-error a selector receives the atom's value
useAtomValue(count, (n: string) => n);

// @ts-expect-error the promise modes are for AsyncResult atoms
useAtomSet(count, { mode: 'promise' });

// @ts-expect-error a writable atom takes values of its write type
setCount('two');

// @ts-expect-error useAtomSuspense reads AsyncResult atoms
useAtomSuspense(count);

// @ts-expect-error a property ref names a key of the ref's value
useAtomRefProp(ref, 'missing');

// @ts-expect-error a scoped atom with input requires the provider's value
export const missingValue: Parameters<typeof scopedWithInput.Provider>[0] = {};
