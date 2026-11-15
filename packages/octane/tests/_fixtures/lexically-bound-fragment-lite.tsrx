import type { OctaneNode } from 'octane';

function Fragment(_props: { children?: OctaneNode }) @{
	<i>expected</i>
}

export function Wrapper() @{
	<Fragment>
		<b>ignored</b>
	</Fragment>
}

export function NestedLocalFragment() @{
	<main>
		<Wrapper />
	</main>
}
