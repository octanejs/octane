/** @jsxImportSource react */
import * as React from 'react';
import { OctaneCompat, type OctaneReactComponent } from 'octane/react';
import type { NestedProps } from './nested-types.js';

function Frame({ strict, children }: { strict: boolean; children: React.ReactNode }) {
	return strict ? <React.StrictMode>{children}</React.StrictMode> : children;
}

function ReactLeaf(props: NestedProps) {
	const [count, setCount] = React.useState(0);
	React.useEffect(() => {
		const signal = () => props.onSignal('react', props.label);
		props.bus.addEventListener('ping', signal);
		return () => props.bus.removeEventListener('ping', signal);
	}, [props.bus, props.onSignal, props.label]);
	return (
		<button data-nested-react="" ref={props.reactRef} onClick={() => setCount(count + 1)}>
			{props.label + ':react:' + count}
		</button>
	);
}

export function ReactLeafFrame(props: NestedProps) {
	return (
		<Frame strict={props.strict}>
			<ReactLeaf {...props} />
		</Frame>
	);
}

export function ReactMiddle(props: NestedProps & { Leaf: OctaneReactComponent<NestedProps> }) {
	const [show, setShow] = React.useState(true);
	return (
		<Frame strict={props.strict}>
			<section>
				<ReactLeaf {...props} />
				<button data-toggle-octane="" onClick={() => setShow(!show)}>
					Toggle Octane leaf
				</button>
				{show && (
					<OctaneCompat>
						<props.Leaf {...props} />
					</OctaneCompat>
				)}
			</section>
		</Frame>
	);
}

export function ReactOuter(props: NestedProps & { Island: OctaneReactComponent<NestedProps> }) {
	const [show, setShow] = React.useState(true);
	return (
		<Frame strict={props.strict}>
			<main>
				<button data-toggle-nested="" onClick={() => setShow(!show)}>
					Toggle nested island
				</button>
				{show && (
					<OctaneCompat>
						<props.Island {...props} />
					</OctaneCompat>
				)}
			</main>
		</Frame>
	);
}
