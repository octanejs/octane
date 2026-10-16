import { __useCommittedState, startTransition, useLayoutEffect, useState } from 'octane';

const pendingSlot = Symbol('integration.pending');

interface IntegrationProps {
	beforeCommit: () => void;
	afterCommit: () => void;
	onLayout: (value: boolean) => void;
}

function IntegrationButton(props: IntegrationProps) @{
	const [pending, setPending, commitPending] = __useCommittedState(false, pendingSlot);
	useLayoutEffect(() => {
		props.onLayout(pending);
	}, [pending, props.onLayout]);
	<>
		<button
			class="commit"
			onClick={() => {
				props.beforeCommit();
				commitPending(true);
				props.afterCommit();
			}}
		>
			{String(pending)}
		</button>
		<button class="ordinary" onClick={() => setPending(false)}>
			Reset
		</button>
	</>
}

export function IntegrationScreen(props: Omit<IntegrationProps, 'beforeCommit'>) @{
	const [open, setOpen] = useState(true);
	<section data-open={String(open)}>
		<IntegrationButton {...props} beforeCommit={() => setOpen(false)} />
	</section>
}

export function PendingOwner(props: { afterCommit: () => void }) @{
	const [pending, , commitPending] = __useCommittedState(false, pendingSlot);
	const [progress, setProgress] = useState(0);
	<button
		onClick={() => {
			startTransition(() => setProgress(1));
			commitPending(true);
			props.afterCommit();
		}}
	>
		{String(pending)}:{String(progress)}
	</button>
}
