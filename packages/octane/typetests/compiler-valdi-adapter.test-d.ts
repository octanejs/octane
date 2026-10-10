import type { ValdiAdapter, ValdiHookSlot, ValdiWriter } from 'octane/compiler/valdi';

type Prototype = { readonly identity: symbol };
type Constructor = { readonly nativeType: symbol };
type Key = { readonly path: readonly unknown[] };
declare const adapter: ValdiAdapter<Prototype, Constructor, Key>;
declare const slot: ValdiHookSlot;

const Scene = adapter.defineValdiComponent((props: { label: string }) => {}, { hasHooks: false });
Scene({ label: 'typed' });
// @ts-expect-error — registration must retain required component props.
Scene({});
// @ts-expect-error — registration must retain each prop's value type.
Scene({ label: 123 });

const prototype = adapter.jsx.makeNodePrototype('label', ['value', 'typed']);
const key = adapter.valdiKey(prototype, 'outer', 1);
adapter.jsx.beginRender(prototype, key);
adapter.jsx.endRender();
const constructor = adapter.getValdiComponentConstructor(Scene);
adapter.jsx.beginComponent(constructor, adapter.jsx.makeComponentPrototype(), undefined);
adapter.jsx.setViewModelProperty('label', 'typed');
adapter.jsx.endComponent();
// @ts-expect-error — the selected adapter's key is opaque, not a string.
adapter.jsx.beginRender(prototype, 'key');

const writer: ValdiWriter<Prototype, Constructor, Key> = adapter.jsx;
writer.setAttributeString('value', null);
writer.setAttributeBool('enabled', undefined);
writer.setAttributeNumber('width', null);
// @ts-expect-error — typed writers still validate their proven primitive kind.
writer.setAttributeString('value', 123);

const [count, setCount, getCount] = adapter.__useStateWithGetter(1, slot);
const number: number = getCount();
setCount((previous) => previous + count);
// @ts-expect-error — state update values retain the inferred state type.
setCount('wrong');

const [empty, setEmpty, getEmpty] = adapter.__useStateWithGetter<string>(undefined, slot);
const maybeString: string | undefined = getEmpty();
setEmpty(undefined);
setEmpty((previous) => previous?.toUpperCase());
// @ts-expect-error — omitted initializers do not create an initialized string.
const initializedString: string = empty;
// @ts-expect-error — the getter retains undefined too.
const initializedGetter: string = getEmpty();
// @ts-expect-error — the state updater still rejects other value kinds.
setEmpty(42);

const ref = adapter.useRef<string>(undefined, slot);
ref.current = undefined;
ref.current = 'ready';
// @ts-expect-error — the ref retains its authored generic value type.
ref.current = 42;
const initializedRef = adapter.useRef(1, slot);
// @ts-expect-error — initialized refs do not silently widen to undefined.
initializedRef.current = undefined;

const spreadState = adapter.withSlot(
	slot,
	adapter.__useStateWithGetter<number>,
	...([1] as [number]),
);
const spreadNumber: number = spreadState[2]();
const spreadRef = adapter.withSlot(slot, adapter.useRef<number>, ...([1] as [number]));
const spreadCurrent: number = spreadRef.current;
// @ts-expect-error — the spread overload must not erase its initialized value type.
adapter.withSlot(slot, adapter.useRef<number>, 'wrong');
// @ts-expect-error — state initialization keeps the same restriction through withSlot.
adapter.withSlot(slot, adapter.__useStateWithGetter<number>, 'wrong');
const emptySpread = adapter.withSlot(slot, adapter.__useStateWithGetter<number>, ...([] as []));
// @ts-expect-error — an empty spread still leaves state uninitialized.
const emptySpreadNumber: number = emptySpread[2]();
const emptyRef = adapter.withSlot(slot, adapter.useRef<number>, ...([] as []));
// @ts-expect-error — an empty spread still leaves the ref uninitialized.
const emptyRefNumber: number = emptyRef.current;

declare function identity<T>(value: T): T;
const callback = adapter.useCallback(identity, [], slot);
const literal: 'value' = callback('value');
const memo: number = adapter.useMemo((value: number) => value + 1, [1], slot);
// @ts-expect-error — dependency arrays are arrays or null, not arbitrary values.
adapter.useMemo(() => 1, 'deps', slot);

declare function overloaded(value: number): number;
declare function overloaded(value: string): string;
const overloadedCallback = adapter.useCallback(overloaded, null, slot);
const numericResult: number = overloadedCallback(1);
const stringResult: string = overloadedCallback('value');
// @ts-expect-error — preserving overloads must not produce an untyped function.
overloadedCallback(false);

declare function genericRender<T>(props: { value: T; onValue(value: T): void }): void;
const Generic = adapter.defineValdiComponent(genericRender, { hasHooks: true });
Generic({ value: 1, onValue: (value) => value.toFixed() });
// @ts-expect-error — the registered render still relates its prop types.
Generic({ value: 1, onValue: (value: string) => {} });

declare function overloadedRender(props: { kind: 'number'; value: number }): void;
declare function overloadedRender(props: { kind: 'string'; value: string }): void;
const Overloaded = adapter.defineValdiComponent(overloadedRender, { hasHooks: false });
Overloaded({ kind: 'number', value: 1 });
Overloaded({ kind: 'string', value: 'value' });
// @ts-expect-error — registration must retain each overload, not only its last signature.
Overloaded({ kind: 'number', value: 'wrong' });

const customHook = (value: string, count: number) => ({ label: value.repeat(count) });
const customResult: { label: string } = adapter.withSlot(slot, customHook, 'typed', 2);
// @ts-expect-error — custom-hook argument types remain linked to the callback.
adapter.withSlot(slot, customHook, 1, 'wrong');
adapter.__methodDep(null, 'optional', true, true);
adapter.__methodDep(1, 'toFixed');
// @ts-expect-error — a dependency identity is not guaranteed to be a property value.
const method: () => string = adapter.__methodDep(1, 'toFixed', true);

// Only __useStateWithGetter must provide a getter. A pair-only base hook is valid.
declare const pairOnlyState: {
	<T>(initial: T | (() => T), slot?: ValdiHookSlot): [T, (next: T | ((previous: T) => T)) => void];
	<T = undefined>(
		initial?: undefined,
		slot?: ValdiHookSlot,
	): [T | undefined, (next: T | undefined | ((previous: T | undefined) => T | undefined)) => void];
};
const pair: Pick<ValdiAdapter, 'useState'> = { useState: pairOnlyState };

// An ABI 1 writer need not implement either text capability.
declare const baseWriter: Omit<
	ValdiWriter<Prototype, Constructor, Key>,
	'appendText' | 'renderText'
>;
const abi1: ValdiWriter<Prototype, Constructor, Key> = baseWriter;
// @ts-expect-error — ABI 1 does not promise host text.
abi1.appendText('text');
const textWriter = {
	...baseWriter,
	appendText(value: unknown) {},
	renderText(prototype: Prototype, value: unknown, key: Key | undefined) {},
} satisfies ValdiWriter<Prototype, Constructor, Key>;
textWriter.appendText(['the adapter validates dynamic values']);
textWriter.renderText(prototype, ['one', 2], key);

// @ts-expect-error — numeric ranges and symbols are the supported slot identities.
adapter.useRef(1, 'slot');
// @ts-expect-error — a module claiming the complete contract must provide the hooks.
const incomplete: ValdiAdapter = { jsx: baseWriter };
