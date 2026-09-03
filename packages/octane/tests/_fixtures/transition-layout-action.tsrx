import { startTransition, useLayoutEffect, useState } from 'octane';

export function TransitionLayoutAction() @{
	const [busy, setBusy] = useState(false);
	const [step, setStep] = useState(0);

	useLayoutEffect(() => {
		if (step === 1) {
			setBusy(true);
			startTransition(() => setBusy(false));
		}
	}, [step]);

	const begin = () => {
		setBusy(true);
		startTransition(() => {
			setBusy(false);
			setStep(1);
		});
	};

	<div>
		<button onClick={begin}>begin</button>
		<output>{String(busy) + ':' + String(step)}</output>
	</div>
}
