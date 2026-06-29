import { useState, useTransition, useOptimistic } from 'octane';

// useOptimistic rebases the pending optimistic update on top of a passthrough that
// changes mid-action, using a CUSTOM reducer. Per ReactAsyncActions-test.js:685 / :887.
export function OptimisticRebase(props) @{
	const [saved, setSaved] = useState(1);
	const [isPending, start] = useTransition();
	const [optimistic, addOptimistic] = useOptimistic(saved, (n: number, delta: number) => n + delta);
	props.bind({
		add: () => start(async () => {
			addOptimistic(1);
			await props.gate;
			setSaved((s: number) => s + 1);
		}),
		bumpSaved: () => setSaved((s: number) => s + 1),
	});
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<span id="opt">
			{optimistic as string}
		</span>
		<span id="saved">
			{saved as string}
		</span>
	</div>
}

// Several addOptimistic calls in ONE async action all fold onto the passthrough.
// Per ReactAsyncActions-test.js:1141 "useOptimistic can update repeatedly in the same async action".
export function OptimisticRepeated(props) @{
	const [saved, setSaved] = useState(0);
	const [isPending, start] = useTransition();
	const [optimistic, addOptimistic] = useOptimistic(saved, (n: number, delta: number) => n + delta);
	props.bind(
		() => start(async () => {
			addOptimistic(1);
			addOptimistic(1);
			addOptimistic(1);
			await props.gate;
			setSaved(3);
		}),
	);
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<span id="opt">
			{optimistic as string}
		</span>
		<span id="saved">
			{saved as string}
		</span>
	</div>
}
