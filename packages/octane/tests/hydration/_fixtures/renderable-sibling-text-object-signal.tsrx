// The sibling hole of renderable-sibling-text-object.tsrx in a module with a
// text binding that may carry a signal handle. That lowers the module's
// renderable holes through bindSignalChild instead of the cached-value helper.
import type { OctaneNode } from 'octane';

export function Hole(props: { value: OctaneNode; label: string }) @{
	<section>
		{props.value}
		<i>{props.label as string}</i>
	</section>
}
