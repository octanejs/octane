import { memo, useLayoutEffect, useState, useTransition } from 'octane';

// Fixture for browser/transition-cue (#1864): the playground's Sort button. One
// component owns both `isPending` and the state its transition sets, and a
// memoized list that is deliberately slow renders that state. React commits
// "Sorting…" with the current list before rendering the sort in a later task.

export type TransitionSortProps = {
	busyMs: number;
	onCommit(label: string, sorted: boolean): void;
};

type SlowListProps = {
	sorted: boolean;
	busyMs: number;
};

const SlowList = memo(function SlowList(props: SlowListProps) @{
	const start = performance.now();
	while (performance.now() - start < props.busyMs) {
		// Stand-in for an expensive list render.
	}
	<output data-list>{props.sorted ? 'sorted' : 'unsorted'}</output>
});

export function TransitionSort(props: TransitionSortProps) @{
	const [isPending, startTransition] = useTransition();
	const [sorted, setSorted] = useState(false);
	const label = isPending ? 'Sorting…' : sorted ? 'Unsort' : 'Sort';
	useLayoutEffect(() => {
		props.onCommit(label, sorted);
	}, null);
	<section>
		<button data-sort type="button" onClick={() => startTransition(() => setSorted(!sorted))}>
			{label}
		</button>
		<SlowList sorted={sorted} busyMs={props.busyMs} />
	</section>
}

type SortPanelProps = TransitionSortProps & {
	isPending: boolean;
	startTransition(fn: () => void): void;
};

function SortPanel(props: SortPanelProps) @{
	const [sorted, setSorted] = useState(false);
	const label = props.isPending ? 'Sorting…' : sorted ? 'Unsort' : 'Sort';
	useLayoutEffect(() => {
		props.onCommit(label, sorted);
	}, null);
	<section>
		<button data-sort type="button" onClick={() => props.startTransition(() => setSorted(!sorted))}>
			{label}
		</button>
		<SlowList sorted={sorted} busyMs={props.busyMs} />
	</section>
}

// The same Sort button, with `isPending` owned by an ancestor of the component
// whose state the transition sets. The cue's re-render reaches that component,
// which React renders with its current state in the urgent lane.
export function TransitionSortShell(props: TransitionSortProps) @{
	const [isPending, startTransition] = useTransition();
	<SortPanel
		busyMs={props.busyMs}
		onCommit={props.onCommit}
		isPending={isPending}
		startTransition={startTransition}
	/>
}
