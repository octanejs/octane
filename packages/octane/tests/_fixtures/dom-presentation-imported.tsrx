import { ControlStyleChild, type ControlStyleChildProps } from './dom-presentation-child.tsrx';

export function ImportedControlStylePresentation(props: ControlStyleChildProps) @{
	'use dom bindings';
	<section>
		<ControlStyleChild draft={props.draft} styles={props.styles} />
	</section>
}
