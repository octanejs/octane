import { useLayoutEffect } from 'octane';
import type { WritableSignal } from 'octane/signals';
import { useSignal$ } from 'octane/signals/client';

export function LocalSignal(props: {
	initial: number | (() => number);
	label: string;
	expose?: (value$: WritableSignal<number>) => void;
}) @{
	const value$ = useSignal$(props.initial);
	useLayoutEffect(() => {
		props.expose?.(value$);
	}, [value$, props.expose]);
	<button data-label={props.label} onClick={() => value$.set((value) => value + 1)}>{String(
		value$.get(),
	)}</button>
}

export function LocalRows(props: {
	rows: readonly string[];
	expose: (label: string, value$: WritableSignal<number>) => void;
}) @{
	<section>
		@for (const label of props.rows; key label) {
			<LocalSignal initial={0} label={label} expose={(value$) => props.expose(label, value$)} />
		}
	</section>
}

export function ConditionalLocalSignals(props: { first: boolean }) @{
	if (props.first) {
		const first$ = useSignal$(10);
		first$.get();
	}
	const second$ = useSignal$(20);
	<button onClick={() => second$.set((value) => value + 1)}>{String(second$.get())}</button>
}
