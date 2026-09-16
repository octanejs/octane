import type { SignalHandle } from 'octane/signals';
import type { SignalCSSProperties } from 'octane/jsx-runtime';

export interface ControlStyleChildProps {
	draft: SignalHandle<string>;
	styles: SignalCSSProperties;
}

export function ControlStyleChild(props: ControlStyleChildProps) @{
	'use dom bindings';
	<input value={props.draft} style={props.styles} />
}
