import { use } from 'octane';
import { useSignal$ } from 'octane/signals/client';

interface IncompletePrimaryProps {
	step$: { get(): number };
	initial: Promise<void>;
	retry: Promise<void>;
	outside: Promise<void>;
}

function LocalSignalChild() @{
	const count$ = useSignal$(3);
	<button onClick={() => count$.set(count$.get() + 1)}>{String(count$.get())}</button>
}

function RetryGate(props: { step: number; promise: Promise<void> }) @{
	if (props.step === 1) use(props.promise);
	<span>{'ready'}</span>
}

function IncompletePrimary(props: IncompletePrimaryProps) @{
	const step = props.step$.get();
	if (step === 0) use(props.initial);
	<>
		<LocalSignalChild />
		<RetryGate step={step} promise={props.retry} />
	</>
}

export function IncompletePrimaryRollbackApp(props: IncompletePrimaryProps) @{
	<>
		@try {
			<IncompletePrimary {...props} />
		} @pending {
			<i>{'waiting'}</i>
		}
		<RetryGate step={props.step$.get()} promise={props.outside} />
	</>
}
