// typetests/pristine/api.test-d.ts, line for line, against
// @octanejs/effect-atom with tsrx-tsc and Octane's types: the React
// renderable and element types become OctaneNode.
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
} from '@octanejs/effect-atom';

const count = Atom.make(1);
const double = Atom.fn((n: number) => Effect.succeed(n * 2));
const result = Atom.make(AsyncResult.initial<number, string>());
const ref = AtomRef.make({ count: 1, label: 'a' });
const scoped = make(() => Atom.make(0));
const scopedWithInput = make((name: string) => Atom.make(name));

export type Checks = [
	Assert<Equal<ReturnType<typeof useAtomValue<number>>, number>>,
	Assert<Equal<ReturnType<typeof useAtom<number, number>>[0], number>>,
	Assert<
		Equal<
			ReturnType<typeof useAtom<number, number>>[1],
			(value: number | ((value: number) => number)) => void
		>
	>,
	Assert<Equal<ReturnType<typeof useAtomMount>, void>>,
	Assert<Equal<ReturnType<typeof useAtomRefresh>, () => void>>,
	Assert<Equal<ReturnType<typeof useAtomSubscribe>, void>>,
	Assert<Equal<ReturnType<typeof useAtomInitialValues>, void>>,
	Assert<Equal<ReturnType<typeof useAtomRef<string>>, string>>,
	Assert<
		Equal<ReturnType<typeof useAtomRefProp<{ count: number }, 'count'>>, AtomRef.AtomRef<number>>
	>,
	Assert<Equal<ReturnType<typeof useAtomRefPropValue<{ label: string }, 'label'>>, string>>,
	Assert<Equal<typeof RegistryContext, Context<AtomRegistry.AtomRegistry>>>,
	Assert<
		Equal<
			Parameters<typeof RegistryProvider>[0]['initialValues'],
			Iterable<readonly [Atom.Atom<any>, any, Atom.InitialValueOptions?]> | undefined
		>
	>,
	Assert<Equal<Parameters<typeof RegistryProvider>[0]['children'], OctaneNode | undefined>>,
	Assert<Equal<ReturnType<typeof RegistryProvider>, OctaneNode>>,
	Assert<Equal<typeof scheduleTask, (f: () => void) => () => void>>,
	Assert<Equal<typeof HydrationBoundary, FC<HydrationBoundaryProps>>>,
	Assert<Equal<HydrationBoundaryProps['state'], Iterable<Hydration.DehydratedAtom> | undefined>>,
	Assert<Equal<typeof TypeId, '~@effect/atom-react/ScopedAtom'>>,
	Assert<Equal<typeof scoped, ScopedAtom<Atom.Writable<number>>>>,
	Assert<Equal<ReturnType<typeof scoped.use>, Atom.Writable<number>>>,
	Assert<Equal<typeof scoped.Context, Context<Atom.Writable<number>>>>,
	Assert<Equal<Parameters<typeof scopedWithInput.Provider>[0]['value'], string>>,
];

const setDouble = useAtomSet(double, { mode: 'promise' });
const setDoubleExit = useAtomSet(double, { mode: 'promiseExit' });
const success = useAtomSuspense(result);
const settled = useAtomSuspense(result, { includeFailure: true });

export type ModeChecks = [
	Assert<Equal<ReturnType<typeof setDouble>, Promise<number>>>,
	Assert<Equal<ReturnType<typeof setDoubleExit>, Promise<Exit.Exit<number, never>>>>,
	Assert<Equal<typeof success, AsyncResult.Success<number, string>>>,
	Assert<
		Equal<typeof settled, AsyncResult.Success<number, string> | AsyncResult.Failure<number, string>>
	>,
];

// @ts-expect-error a selector receives the atom's value
useAtomValue(count, (n: string) => n);

// @ts-expect-error the promise modes are for AsyncResult atoms
useAtomSet(count, { mode: 'promise' });

// @ts-expect-error useAtomSuspense reads AsyncResult atoms
useAtomSuspense(count);

// @ts-expect-error a property ref names a key of the ref's value
useAtomRefProp(ref, 'missing');
