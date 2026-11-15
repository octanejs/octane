'use strong';

import { Fragment as Group, useState, type OctaneNode } from 'octane';
import * as Native from 'octane';

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

export function ShadowedFragmentImports(props: { label: string }) @{
	if (true) {
		var Group = Fragment;
		var Native = { Fragment };
	}
	<main>
		<Group label={props.label}>
			<IgnoredChild />
		</Group>
		<Native.Fragment label={props.label}>
			<IgnoredChild />
		</Native.Fragment>
	</main>
}

export function GenuineFragmentImports() @{
	<main>
		<Group>
			<p>named fragment</p>
		</Group>
		<Native.Fragment>
			<p>namespace fragment</p>
		</Native.Fragment>
	</main>
}
