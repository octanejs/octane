import { useState } from 'octane';

export function FocusEvents(props: { log: (label: string, event: FocusEvent) => void }) @{
	const [last, setLast] = useState('idle');
	<div
		onFocusCapture={(event) => props.log('focus capture', event)}
		onFocus={(event) => props.log('focus bubble', event)}
		onBlurCapture={(event) => props.log('blur capture', event)}
		onBlur={(event) => props.log('blur bubble', event)}
	>
		<input
			aria-label="focus target"
			onFocus={(event) => {
				props.log('focus target', event);
				setLast(event.type);
			}}
			onBlur={(event) => {
				props.log('blur target', event);
				setLast(event.type);
			}}
		/>
		<output>{last}</output>
	</div>
}
