import { useLayoutEffect, useState, type OctaneNode } from 'octane';

interface ChildProps {
	label: string;
	pick: (label: string) => void;
	effect: () => void;
	cleanup: () => void;
}

export function Child(props: ChildProps) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.effect();
		return () => props.cleanup();
	}, [props.label]);
	<article>
		<input defaultValue={props.label} />
		<button
			onClick={() => {
				props.pick(props.label);
				setCount(count + 1);
			}}
		>
			{props.label + ':' + count}
		</button>
	</article>
}

export function Other(props: ChildProps) @{
	<aside>{props.label as string}</aside>
}

export function Slots(props: ChildProps & {
	component: typeof Child;
	identity: string;
	value: OctaneNode;
}) @{
	const Component = props.component;
	<section>
		<Component
			key={props.identity}
			label={props.label}
			pick={props.pick}
			effect={props.effect}
			cleanup={props.cleanup}
		/>
		<div data-hole>{props.value}</div>
	</section>
}
