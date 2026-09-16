import type { SignalHandle } from 'octane/signals';

export interface Props {
	classes: string | SignalHandle<string>;
	progress: number | SignalHandle<number>;
	secondary: number | SignalHandle<number>;
	caption: string | SignalHandle<string>;
	unrelated: string | SignalHandle<string>;
}

// Deliberately unsuffixed aliases: runtime capability, not spelling, selects
// the direct signal channel. Both benchmark lanes use this same authored view.
export function View(props: Props) @{
	'use dom bindings';
	<section
		class={props.classes}
		style={{ '--progress': props.progress, '--secondary': props.secondary }}
		title={props.unrelated}
	>
		<span>{props.caption}</span>
	</section>
}
