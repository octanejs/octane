import type { SignalHandle } from 'octane/signals';
import 'octane/signals';

interface Props {
	left$: SignalHandle<number>;
	right$: SignalHandle<number>;
	record: () => void;
}

export function DirectStyles(props: Props) @{
	props.record();
	<div style={{ color: 'red', left: props.left$, right: props.right$ }}>
		<span>{'stable'}</span>
	</div>
}

export function SampledStyles(props: Props) @{
	props.record();
	<div style={{ color: 'red', left: props.left$.get(), right: props.right$.get() }}>
		<span>{'stable'}</span>
	</div>
}
