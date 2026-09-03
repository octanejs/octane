import { withSlot } from 'octane';
import { useSelector, useStore } from '@octanejs/tanstack-store';
import type { Atom } from '@tanstack/store';

const pairCall = Symbol('selector pair');
const leftSelection = Symbol('left selection');
const rightSelection = Symbol('right selection');

type ExplicitReader =
	(source: Atom<number>, selector: undefined, options: undefined, slot: symbol) => number;

function readExplicitPair(legacy: boolean, left: Atom<number>, right: Atom<number>) {
	const read = (legacy ? useStore : useSelector) as ExplicitReader;
	return [
		read(left, undefined, undefined, leftSelection),
		read(right, undefined, undefined, rightSelection),
	] as const;
}

export function ExplicitSelectorPair(props: {
	left: Atom<number>;
	right: Atom<number>;
	legacy: boolean;
}) @{
	const [left, right] = withSlot(pairCall, readExplicitPair, props.legacy, props.left, props.right);
	<p id="pair">{left + '/' + right}</p>
}
