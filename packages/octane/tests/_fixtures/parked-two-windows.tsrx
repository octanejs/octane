import { use, useEffect, useLayoutEffect, useState } from 'octane';

interface Controls {
	setStep: (value: number) => void;
	setLocal: (value: number) => void;
	setSusp: (value: number) => void;
}

interface RowProps {
	id: string;
	log: (event: string) => void;
	onLayoutCleanup: (id: string) => void;
}

interface ListProps extends Omit<RowProps, 'id'> {
	step: number;
	api: Controls;
}

interface SuspenderProps {
	api: Controls;
	load: (step: number) => Promise<string>;
}

interface AppProps extends Omit<ListProps, 'step'>, SuspenderProps {}

function Row(props: RowProps) @{
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

function ListOwner(props: ListProps) @{
	const [local, setLocal] = useState(0);
	props.api.setLocal = setLocal;
	const items =
		local === 1
			? ['c']
			: local === 3
				? ['a', 'x', 'b', 'c']
				: props.step === 0
					? ['a', 'b', 'c']
					: ['a', 'c'];
	<ul id="list">
		@for (const id of items; key id) {
			<Row id={id} log={props.log} onLayoutCleanup={props.onLayoutCleanup} />
		}
	</ul>
}

function RootSuspender(props: SuspenderProps) @{
	const [susp, setSusp] = useState(0);
	props.api.setSusp = setSusp;
	const value = use(props.load(susp));
	<span id="value">{value as string}</span>
}

function Deep3(props: SuspenderProps) @{
	<RootSuspender api={props.api} load={props.load} />
}
function Deep2(props: SuspenderProps) @{
	<Deep3 api={props.api} load={props.load} />
}
function Deep1(props: SuspenderProps) @{
	<Deep2 api={props.api} load={props.load} />
}

export function NestedKeyedRollback(props: AppProps) @{
	const [step, setStep] = useState(0);
	props.api.setStep = setStep;
	<div>
		@try {
			<ListOwner
				step={step}
				api={props.api}
				log={props.log}
				onLayoutCleanup={props.onLayoutCleanup}
			/>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
		<Deep1 api={props.api} load={props.load} />
	</div>
}
