import { useLayoutEffect, useState, useTransition } from 'octane';

export type Scenario = 'urgent' | 'single-owner' | 'repeat-owner' | 'two-owners' | 'two-updates';
export type Model = { step: () => void; commits: number; cleanups: number };
type Props = { scenario: Scenario; model: Model };

export function App({ scenario, model }: Props) @{
	const [value, setValue] = useState(0);
	const [pending, start] = useTransition();
	model.step = () => {
		const update = () => setValue((previous) => previous + 1);
		if (scenario === 'urgent') update();
		else if (scenario === 'repeat-owner') start(() => start(update));
		else if (scenario === 'two-updates') start(() => {
			update();
			update();
		});
		else start(update);
	};
	useLayoutEffect(() => {
		model.commits++;
		return () => {
			model.cleanups++;
		};
	}, [value]);
	<div>
		<output id="value">{String(value)}</output>
		<output data-pending>{String(pending)}</output>
	</div>
}

export function TwoOwners({ model }: Props) @{
	const [value, setValue] = useState(0);
	const [firstPending, startFirst] = useTransition();
	const [secondPending, startSecond] = useTransition();
	model.step = () => startFirst(() => startSecond(() => setValue((previous) => previous + 1)));
	useLayoutEffect(() => {
		model.commits++;
		return () => {
			model.cleanups++;
		};
	}, [value]);
	<div>
		<output id="value">{String(value)}</output>
		<output data-pending>{String(firstPending)}</output>
		<output data-pending>{String(secondPending)}</output>
	</div>
}
