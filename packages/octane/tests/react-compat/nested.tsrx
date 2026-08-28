import { useEffect, useState } from 'octane';
import { ReactCompat } from 'octane/react';
import { ReactLeafFrame, ReactMiddle } from './nested.react.js';
import type { NestedProps } from './nested-types.js';

export function OctaneLeaf(props: NestedProps) @{
	const [count, setCount] = useState(0);
	useEffect(() => {
		const signal = () => props.onSignal('octane', props.label);
		props.bus.addEventListener('ping', signal);
		return () => props.bus.removeEventListener('ping', signal);
	}, [props.bus, props.onSignal, props.label]);

	<button data-nested-octane="" ref={props.octaneRef} onClick={() => setCount(count + 1)}>
		{props.label + ':octane:' + count}
	</button>
}

export function OctaneMiddle(props: NestedProps) @{
	<section>
		<OctaneLeaf {...props} />
		<ReactCompat>
			<ReactLeafFrame {...props} />
		</ReactCompat>
	</section>
}

export function OctaneOuter(props: NestedProps & { show?: boolean }) @{
	<main>
		@if (props.show !== false) {
			<ReactCompat>
				<ReactMiddle {...props} Leaf={OctaneLeaf} />
			</ReactCompat>
		}
	</main>
}
