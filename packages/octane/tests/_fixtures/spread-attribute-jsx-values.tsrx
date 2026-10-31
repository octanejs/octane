import { useState } from 'octane';
import type { OctaneNode } from 'octane';

function Label(props: { n: number }) @{
	<b>{String(props.n) as string}</b>
}

function View(props: { render?: (n: number) => OctaneNode }) @{
	<div>{props.render?.(1)}</div>
}

export function ComponentSpread() @{
	<View {...{ render: (n: number) => <Label n={n} /> }} />
}

export function ConditionalSpread(props: { cond: boolean }) @{
	<View
		{...(props.cond
			? {
					render: (n: number) => {
						return n ? <Label n={n} /> : null;
					},
				}
			: {})}
	/>
}

export function HostSpread() @{
	const [shown, setShown] = useState<OctaneNode>(null);
	<div>
		<button {...{ onClick: () => setShown(<Label n={2} />) }}>{'open'}</button>
		{shown}
	</div>
}
