'use strong';

import { useState, type OctaneNode } from 'octane';

function Fragment(props: { children?: OctaneNode; label: string }) @{
	const [count, setCount] = useState(0);
	const label = props.label + ': ' + count;
	<button onClick={() => setCount(count + 1)}>{label as string}</button>
}

function IgnoredChild(): never {
	throw new Error('Ignored child rendered');
}

export function LocalFragment(props: { label: string }) @{
	<main>
		<Fragment label={props.label}>
			<IgnoredChild />
		</Fragment>
	</main>
}
