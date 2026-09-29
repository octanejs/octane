// The only-child hole of renderable-empty-text.tsrx in a module with a text
// binding that may carry a signal handle. That lowers the module's renderable
// holes through bindSignalChild instead of the cached-value update helper.
import type { OctaneNode } from 'octane';

export function Hole(props: { value: OctaneNode; label: string }) @{
	<section>
		<div>{props.value}</div>
		<i>{props.label as string}</i>
	</section>
}
