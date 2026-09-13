import { use, useLayoutEffect, useState } from 'octane';

interface Controls {
	setStep: (value: number) => void;
	rows: Map<string, (value: number) => void>;
}

interface Props {
	api: Controls;
	load: (step: number) => PromiseLike<string>;
	cleanup: (id: string) => void;
}

function Row(props: { id: string; api: Controls; cleanup: Props['cleanup'] }) @{
	const [count, setCount] = useState(0);
	props.api.rows.set(props.id, setCount);
	useLayoutEffect(() => () => props.cleanup(props.id), []);
	<>
		<button data-row={props.id} onClick={() => setCount(count + 1)}>
			{props.id + ':' + count}
		</button>
		<span data-detail={props.id}>{'detail:' + props.id}</span>
	</>
}

function Reader(props: { step: number; load: Props['load'] }) @{
	const value = use(props.load(props.step));
	<p id="removal-value">{value as string}</p>
}

export function KeyedRemovalLifetime(props: Props) @{
	const [step, setStep] = useState(0);
	props.api.setStep = setStep;
	const rows =
		step === 0 ? ['a', 'b', 'c'] : ['a', 'c'];
	<section>
		@try {
			<div>
				@for (const id of rows; key id) {
					<Row id={id} api={props.api} cleanup={props.cleanup} />
				}
				<Reader step={step} load={props.load} />
			</div>
		} @pending {
			<p id="removal-fallback">{'Loading'}</p>
		}
	</section>
}
