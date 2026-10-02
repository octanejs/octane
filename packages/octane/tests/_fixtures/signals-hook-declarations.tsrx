import { derived$, query$, signal$, type DerivedSignal, type WritableSignal } from 'octane/signals';
import { useAliasedPair$, useForwardedPair$ } from './signals-hook-declarations-forward.tsrx';
import { useLocalPair$ } from './signals-hook-declarations-cell';
import { useRenamedPair$, useStoredPair$ } from './signals-hook-declarations-pair';

type Load = (key: string) => Promise<string>;

function useUser$(id: string, load: Load) {
	return query$(() => id, load);
}

export function TwoQueries(props: { a: string; b: string; load: Load }) @{
	const a$ = useUser$(props.a, props.load);
	const b$ = useUser$(props.b, props.load);
	const sa = a$.snapshot();
	const sb = b$.snapshot();
	<p>
		{(sa.status === 'ready' ? sa.value : sa.status) as string}
		{'|'}
		{(sb.status === 'ready' ? sb.value : sb.status) as string}
	</p>
}

export function TwoStrictQueries(props: { a: string; b: string; load: Load }) @{
	const a$ = useUser$(props.a, props.load);
	const b$ = useUser$(props.b, props.load);
	<p>{a$.get() + '|' + b$.get()}</p>
}

export interface Cell {
	value$: WritableSignal<string>;
	shout$: DerivedSignal<string>;
}

function useCell$(initial: string): Cell {
	const value$ = signal$(initial);
	const shout$ = derived$(() => value$.get().toUpperCase());
	return { value$, shout$ };
}

function usePair$(left: string, right: string): Cell[] {
	return [useCell$(left), useCell$(right)];
}

function bump(cell: Cell | null) {
	cell?.value$.set((value) => value + '!');
}

export function Cells(props: { first: string; second: string; showFirst: boolean }) @{
	// A skipped hook keeps its cells; the remaining calls keep their own.
	const first =
		props.showFirst ? useCell$(props.first) : null;
	const second = useCell$(props.second);
	const [left, right] = usePair$('l', 'r');
	const [left2, right2] = usePair$('l2', 'r2');
	const text = [
		first ? first.shout$.get() : '-',
		second.shout$.get(),
		left.value$.get(),
		right.value$.get(),
		left2.value$.get(),
		right2.value$.get(),
	].join(',');
	<section>
		<output>{text}</output>
		<button class="first" onClick={() => bump(first)}>{'first'}</button>
		<button class="second" onClick={() => bump(second)}>{'second'}</button>
		<button class="right" onClick={() => bump(right)}>{'right'}</button>
		<button class="left2" onClick={() => bump(left2)}>{'left2'}</button>
	</section>
}

export function StoredPairs(props: {
	via: 'plain' | 'renamed' | 'local' | 'forwarded' | 'aliased';
}) @{
	const usePair$ =
		props.via === 'aliased'
			? useAliasedPair$
			: props.via === 'forwarded'
				? useForwardedPair$
				: props.via === 'renamed'
					? useRenamedPair$
					: props.via === 'local'
						? useLocalPair$
						: useStoredPair$;
	const [a$, b$] = usePair$('a', 'b');
	const [c$, d$] = usePair$('c', 'd');
	<section>
		<output>{[a$, b$, c$, d$].map((cell$) => cell$.get()).join(',')}</output>
		<button onClick={() => b$.set((value) => value + '!')}>{'b'}</button>
	</section>
}
