import { startTransition, use, useEffect, useLayoutEffect, useState } from 'octane';

interface Controls {
	setStep: (value: number) => void;
	setLocal: (value: number) => void;
	setSusp: (value: number) => void;
}

interface AppProps {
	api: Controls;
	load: (step: number) => Promise<string>;
	log: (entry: string) => void;
	onLayoutCleanup: (id: string) => void;
	size?: number;
}

function Row(props: {
	id: string;
	log: AppProps['log'];
	onLayoutCleanup: AppProps['onLayoutCleanup'];
}) @{
	const [local] = useState(props.id + '!');
	useLayoutEffect(() => () => props.onLayoutCleanup(props.id), []);
	useEffect(() => {
		props.log('mount:' + props.id);
		return () => props.log('cleanup:' + props.id);
	}, []);
	<>
		<li id={'row-' + props.id}>{local as string}</li>
		<li id={'detail-' + props.id}>{'detail:' + props.id}</li>
	</>
}

function ListOwner(props: AppProps & { step: number; transitionRefill?: boolean }) @{
	const [local, setLocal] = useState(0);
	props.api.setLocal = setLocal;
	const original =
		props.size === undefined
			? ['a', 'b', 'c']
			: Array.from({ length: props.size }, (_, index) => String(index));
	const inserted = [original[0], 'x', ...original.slice(1)];
	const items =
		local === 1
			? ['d']
			: local === 3
				? inserted
				: props.step === 0
					? original
					: [];
	if (local === 1 && props.step === 1) props.api.setSusp(1);
	<ul id="list">
		@for (const id of items; key id) {
			@if (props.size === undefined) {
				<Row id={id} log={props.log} onLayoutCleanup={props.onLayoutCleanup} />
			} @else {
				<li id={'row-' + id}>{id as string}</li>
			}
		} @empty {
			if (local === 0 && props.step === 1) {
				if (props.transitionRefill) startTransition(() => setLocal(1));
				else setLocal(1);
			}
			<li id="empty">{'nothing'}</li>
		}
	</ul>
}

function RootSuspender(props: AppProps) @{
	const [susp, setSusp] = useState(0);
	props.api.setSusp = setSusp;
	const value = use(props.load(susp));
	<span id="value">{value as string}</span>
}

export function EmptyRefillRollback(props: AppProps) @{
	const [step, setStep] = useState(0);
	props.api.setStep = setStep;
	<div>
		@try {
			<ListOwner {...props} step={step} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
		<RootSuspender {...props} />
	</div>
}

export function NestedCommitEmptyRefill(props: AppProps) @{
	const [step, setStep] = useState(0);
	props.api.setStep = setStep;
	<div>
		@try {
			<div>
				<ListOwner {...props} step={step} transitionRefill={true} />
				<RootSuspender {...props} />
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
