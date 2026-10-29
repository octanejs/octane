import { hookSlots, useRef } from 'octane';
import { useRef as useServerRef } from 'octane/server';
import { useRef as useUniversalRef } from 'octane/universal';

// React 19's ref pattern: an explicit element type with a `null` or `undefined`
// initializer widens `current` to admit that initializer.
const element = useRef<HTMLDivElement>(null);
const serverElement = useServerRef<HTMLDivElement>(null);
const universalElement = useUniversalRef<HTMLDivElement>(null);
const elements: (HTMLDivElement | null)[] = [
	element.current,
	serverElement.current,
	universalElement.current,
];
element.current = null;
serverElement.current = null;
universalElement.current = null;

// @ts-expect-error The client ref keeps `null` in its value type.
const definiteElement: HTMLDivElement = element.current;
// @ts-expect-error The server ref keeps `null` in its value type.
const definiteServerElement: HTMLDivElement = serverElement.current;
// @ts-expect-error The universal ref keeps `null` in its value type.
const definiteUniversalElement: HTMLDivElement = universalElement.current;

const map = useRef<Map<string, number>>(undefined);
const serverMap = useServerRef<Map<string, number>>(undefined);
const universalMap = useUniversalRef<Map<string, number>>(undefined);
const maps: (Map<string, number> | undefined)[] = [
	map.current,
	serverMap.current,
	universalMap.current,
];
map.current = undefined;

// @ts-expect-error The client ref keeps `undefined` in its value type.
const definiteMap: Map<string, number> = map.current;
// @ts-expect-error The server ref keeps `undefined` in its value type.
const definiteServerMap: Map<string, number> = serverMap.current;
// @ts-expect-error The universal ref keeps `undefined` in its value type.
const definiteUniversalMap: Map<string, number> = universalMap.current;
// @ts-expect-error A `null` initializer does not admit `undefined`.
element.current = undefined;

// The compiler-appended slot still type-checks on every nullable overload.
for (const slot of [hookSlots(4), Symbol('ref')]) {
	const slotted: HTMLDivElement | null = useRef<HTMLDivElement>(null, slot).current;
	const serverSlotted: HTMLDivElement | null = useServerRef<HTMLDivElement>(null, slot).current;
	const slottedMap: Map<string, number> | undefined = useRef<Map<string, number>>(
		undefined,
		slot,
	).current;
	void [slotted, serverSlotted, slottedMap];
}

// Inferred initializers and non-nullable explicit types are unchanged.
const literalNull: null = useRef(null).current;
const count: number = useRef<number>(1).current;
// @ts-expect-error A non-nullish initializer must still match the explicit type.
useRef<HTMLDivElement>('div');
// @ts-expect-error The server ref also rejects a mismatched initializer.
useServerRef<HTMLDivElement>('div');

void [
	elements,
	definiteElement,
	definiteServerElement,
	definiteUniversalElement,
	maps,
	definiteMap,
	definiteServerMap,
	definiteUniversalMap,
	literalNull,
	count,
];
