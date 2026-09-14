// Load this oracle's Bun globals without changing the workspace Bun type package.
import 'pristine-bun-types';

import * as A from 'react-alien-signals';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';

// Repository-authored contracts against the authenticated 0.4.0 declarations.
// The complete unchanged upstream program is included separately in this project.
type ExpectedWritable = { (): number; (value: number): void };
type ExpectedSetter = (value: number | ((previous: number) => number)) => void;
type ExpectedDependencies = readonly unknown[];
type ExpectedEffect = () => void | (() => void);
type Contract0 = Assert<Equal<A.ReadableSignal<number>, () => number>>;
type Contract1 = Assert<Equal<A.WritableSignal<number>, { (): number; (value: number): void }>>;
type Contract3 = Assert<
	Equal<A.SignalSetter<number>, (value: number | ((previous: number) => number)) => void>
>;
type Contract4 = Assert<Equal<A.SignalEffectCallback, () => void | (() => void)>>;
type Contract5 = Assert<Equal<A.SignalEffectDependencies, readonly (() => unknown)[]>>;
type Contract6 = Assert<Equal<ReturnType<typeof A.createSignal<number>>, ExpectedWritable>>;
type Contract7 = Assert<Equal<ReturnType<typeof A.createComputed<number>>, () => number>>;
type Contract8 = Assert<Equal<ReturnType<typeof A.createEffect>, () => void>>;
type Contract9 = Assert<Equal<ReturnType<typeof A.createSignalScope>, () => void>>;
type Contract10 = Assert<Equal<ReturnType<typeof A.batch<string>>, string>>;
type Contract11 = Assert<Equal<Parameters<typeof A.trigger>, [() => unknown]>>;
type Contract12 = Assert<Equal<ReturnType<typeof A.useSignal<number>>, [number, ExpectedSetter]>>;
type Contract13 = Assert<Equal<ReturnType<typeof A.useSignalValue<number>>, number>>;
type Contract14 = Assert<Equal<ReturnType<typeof A.useSetSignal<number>>, ExpectedSetter>>;
type Contract15 = Assert<
	Equal<Parameters<typeof A.useSignalEffect>, [ExpectedEffect, ExpectedDependencies?]>
>;
type Contract16 = Assert<Equal<ReturnType<typeof A.useSignalScope>, () => void>>;
type Contract17 = Assert<Equal<ReturnType<typeof A.useComputed<number>>, number>>;
type Contract18 = Assert<Equal<ReturnType<typeof A.useDeferredSignalValue<number>>, number>>;
type Contract19 = Assert<
	Equal<ReturnType<typeof A.useSignalSelector<{ selected: number }, number>>, number>
>;
type Contract20 = Assert<
	Equal<
		Parameters<typeof A.useSignalPassiveEffect>,
		[readonly (() => unknown)[], ExpectedEffect, ExpectedDependencies?]
	>
>;
type Contract21 = Assert<
	Equal<
		Parameters<typeof A.useSignalLayoutEffect>,
		[readonly (() => unknown)[], ExpectedEffect, ExpectedDependencies?]
	>
>;
type Contract22 = Assert<
	Equal<
		Parameters<typeof A.useSignalInsertionEffect>,
		[readonly (() => unknown)[], ExpectedEffect, ExpectedDependencies?]
	>
>;

const count = A.createSignal(1);
A.useSetSignal(count)((previous) => previous + 1);
const derived = A.createComputed((previous: number = 0) => count() + previous);
const selected: number = A.useSignalSelector(derived, (value) => value * 2);
A.useSignalEffect(() => undefined, []);
A.useSignalScope(() => undefined, []);
const state = A.createSignal<() => string>(() => 'value');
A.useSetSignal(state)(() => () => 'replacement');
// @ts-expect-error a numeric signal cannot accept a string setter value
A.useSetSignal(count)('wrong');
// @ts-expect-error selector input must match the signal value type
A.useSignalSelector(count, (value: string) => value.length);
// @ts-expect-error computed signals remain read-only
derived(1);
// @ts-expect-error inferred selector output is numeric
const wrongSelected: string = selected;
