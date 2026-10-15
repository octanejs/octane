'use strong';

import { useState } from 'octane';

// The default error UI, markup-identical to react-router's ErrorComponent (string
// styles serialize to the same inline css React produces, so the differential rig
// can byte-compare it).
export function ErrorComponent(props: {
	error: any;
	reset?: () => void;
	info?: { componentStack?: string };
}) @{
	const [show, setShow] = useState(process.env.NODE_ENV !== 'production');

	<div style="padding:.5rem;max-width:100%">
		<div style="display:flex;align-items:center;gap:.5rem">
			<strong style="font-size:1rem">Something went wrong!</strong>
			<button
				style="appearance:none;font-size:.6em;border:1px solid currentColor;padding:.1rem .2rem;font-weight:bold;border-radius:.25rem"
				onClick={() => setShow((d) => !d)}
			>
				{show ? 'Hide Error' : 'Show Error'}
			</button>
		</div>
		<div style="height:.25rem"></div>
		@if (show) {
			<div>
				<pre style="font-size:.7em;border:1px solid red;border-radius:.25rem;padding:.3rem;color:red;overflow:auto">
					@if (props.error?.message) {
						<code>{props.error.message as string}</code>
					}
				</pre>
			</div>
		}
	</div>
}
