// Ported from @radix-ui/react-primitive. `Primitive.<tag>` renders a host element, or —
// when `asChild` is set — merges its props onto the single element child via `Slot`.
// octane is ref-as-prop, so `ref` flows through `props` like any other prop.
import { createElement } from 'octane';

import { Slot } from './Slot';

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
		return asChild ? Slot(primitiveProps) : createElement(node, primitiveProps);
	};
}

export const Primitive = {} as Record<PrimitiveNode, (props: any) => any>;
for (const node of NODES) {
	Primitive[node] = makePrimitive(node);
}
