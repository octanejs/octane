import type { SignalHandle } from 'octane/signals';

interface SignalProps {
	value$: SignalHandle<string>;
	primary$?: SignalHandle<string>;
	limit$: SignalHandle<number>;
	max: number;
}

export function SignalInputs(props: SignalProps) @{
	<form id="signals">
		<input
			name="model"
			type="range"
			value={props.primary$ ?? props.value$}
			max={props.max}
			is="ordered-signal-range"
			readOnly
		/>
		<input name="constraint" type="range" value={150} max={props.limit$} readOnly />
	</form>
}
