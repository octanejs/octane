import { useLazyRef, useRef } from 'octane';
import { useLazyRef as useServerLazyRef } from 'octane/server';
import { useLazyRef as useUniversalLazyRef, useRef as useUniversalRef } from 'octane/universal';

const value = useLazyRef(() => ({ count: 1 }));
const count: number = value.current.count;

const callback = () => 1;
const ordinary = useRef(callback);
const storedCallback: () => number = ordinary.current;

const functionResult = useLazyRef(() => callback);
const initializedCallback: () => number = functionResult.current;

const slot = Symbol('manual slot');
const manual = useLazyRef(() => 'value', slot);
const manualValue: string = manual.current;
const explicitOrdinary = useRef<() => number>(callback, slot);
const explicitUniversal = useUniversalRef<() => number>(callback, { lazy: true });
const universalLazy = useUniversalLazyRef<string>(() => 'value', { slot: 1 });
const serverManual = useServerLazyRef(() => 'value', slot);

// @ts-expect-error Lazy refs require a factory.
useLazyRef(123);
// @ts-expect-error The explicit value type is a function, so the factory must return a function.
useLazyRef<() => string>(() => 'text');
// @ts-expect-error Universal lazy refs also require a factory.
useUniversalLazyRef(123);
// @ts-expect-error A universal factory for a function-valued ref must return a function.
useUniversalLazyRef<() => string>(() => 'text');
// @ts-expect-error Numeric slots are compiler-owned, not the public DOM slot API.
useLazyRef(() => 1, 5);
// @ts-expect-error Numeric and string slots are compiler-owned on the server.
useServerLazyRef(() => 1, 5);
// @ts-expect-error Server manual slots follow the public symbol slot contract.
useServerLazyRef(() => 1, 'slot');

const initialSymbol = Symbol('ref value');
const ordinarySymbol: symbol = useRef(initialSymbol).current;

void [
	count,
	storedCallback,
	initializedCallback,
	manualValue,
	ordinarySymbol,
	explicitOrdinary,
	explicitUniversal,
	universalLazy,
	serverManual,
];
