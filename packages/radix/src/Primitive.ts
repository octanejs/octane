// Ported from @radix-ui/react-primitive. `Primitive.<tag>` renders a host element, or —
// when `asChild` is set — merges its props onto the single element child via `Slot`.
// octane is ref-as-prop, so `ref` flows through `props` like any other prop.
import { createElement, flushSync } from 'octane';

import { Slot } from './Slot';

/**
 * Dispatch a custom event inside a synchronous flush (React's `ReactDOM.flushSync`
 * dispatch) so any state updates the event handlers make are committed before the next
 * frame — needed when dispatching from a native event that OCTANE/React didn't schedule
 * (e.g. DismissableLayer's `pointerDownOutside` re-dispatch).
 */
export function dispatchDiscreteCustomEvent(target: EventTarget | null, event: CustomEvent): void {
	if (target) flushSync(() => target.dispatchEvent(event));
}

// The host tags Radix exposes as primitives (add more as components need them).
const NODES = [
	'a',
	'button',
	'div',
	'form',
	'h2',
	'h3',
	'img',
	'input',
	'label',
	'li',
	'nav',
	'ol',
	'p',
	'select',
	'span',
	'svg',
	'ul',
] as const;

type PrimitiveNode = (typeof NODES)[number];

function makePrimitive(node: string) {
	return function Primitive(props: any): any {
		const { asChild, ...primitiveProps } = props ?? {};
		// Slot must be rendered as a COMPONENT (its memoized-ref hook needs its own
		// scope — two direct calls in one caller scope would collide).
		return asChild ? createElement(Slot, primitiveProps) : createElement(node, primitiveProps);
	};
}

export const Primitive = {} as Record<PrimitiveNode, (props: any) => any>;
for (const node of NODES) {
	Primitive[node] = makePrimitive(node);
}
