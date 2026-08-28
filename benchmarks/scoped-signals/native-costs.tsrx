import { use } from 'octane';
import type { SignalHandle } from 'octane/signals';
import { make$ } from './native-cost-factory.mjs';

interface ValueProps {
	tick: number;
	value: number;
}

interface ReadProps {
	tick: number;
	source$: SignalHandle<number>;
	sources$: readonly SignalHandle<number>[];
}

export function UnreadBlock(props: ValueProps) @{
	<output data-tick={props.tick}>{String(props.value)}</output>
}

export function UnreadReturn(props: ValueProps) {
	return <output data-tick={props.tick}>{String(props.value)}</output>;
}

export function ReadBlock(props: ReadProps) @{
	const value = props.source$.get();
	<output data-tick={props.tick}>{String(value)}</output>
}

export function ReadReturn(props: ReadProps) {
	const value = props.source$.get();
	return <output data-tick={props.tick}>{String(value)}</output>;
}

export function RepeatedReadBlock(props: ReadProps) @{
	let value = 0;
	for (let index = 0; index < 16; index++) value += props.source$.get();
	<output data-tick={props.tick}>{String(value)}</output>
}

export function DistinctReadBlock(props: ReadProps) @{
	let value = 0;
	for (const source$ of props.sources$) value += source$.get();
	<output data-tick={props.tick}>{String(value)}</output>
}

export function FiveDependencyUse(props: {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	tick: number;
}) @{
	const value = use(make$(props.a, props.b, props.c, props.d, props.e));
	<output data-tick={props.tick}>{value as string}</output>
}
