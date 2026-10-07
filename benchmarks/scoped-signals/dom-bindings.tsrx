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

export function PlainStyles(props: { left: number; right: number; record: () => void }) @{
	props.record();
	<div style={{ color: 'red', left: props.left + 0, right: props.right + 0 }}>
		<span>{'stable'}</span>
	</div>
}

// Components often forward an optional style prop: here a string on the host and
// an unset one on its child. Neither has a native read for a Block to own.
export function ForwardedStyles(props: { style: string; extra?: string; record: () => void }) @{
	props.record();
	<div style={props.style}>
		<span style={props.extra}>{'stable'}</span>
	</div>
}
