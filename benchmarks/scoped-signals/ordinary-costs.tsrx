import { use } from 'octane';
import { make } from './ordinary-cost-factory.mjs';

interface ValueProps {
	tick: number;
	value: number;
}

export function UnreadBlock(props: ValueProps) @{
	<output data-tick={props.tick}>{String(props.value)}</output>
}

export function UnreadReturn(props: ValueProps) {
	return <output data-tick={props.tick}>{String(props.value)}</output>;
}

export function FiveDependencyUse(props: {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	tick: number;
}) @{
	const value = use(make(props.a, props.b, props.c, props.d, props.e));
	<output data-tick={props.tick}>{value as string}</output>
}
