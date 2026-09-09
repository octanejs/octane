import { useEffect, useState, type ComponentBody, type OctaneNode } from 'octane';

interface ChildProps {
	label: string;
	childRef: (element: HTMLButtonElement | null) => void | (() => void);
	onEffect: (label: string) => () => void;
}

function StatefulChild(props: ChildProps) @{
	const [count, setCount] = useState(0);
	useEffect(() => props.onEffect(props.label), [props.onEffect, props.label]);
	<button
		id="host-child"
		ref={props.childRef}
		onClick={() => setCount((value) => value + 1)}
	>{`${props.label}:${count}`}</button>
}

interface HostChildrenProps extends ChildProps {
	host: ComponentBody<{ children?: OctaneNode }>;
	show: boolean;
}

export function HostComponentChildren(props: HostChildrenProps) @{
	const Host = props.host;
	<Host>
		<p id="host-label">{props.label as string}</p>
		@if (props.show) {
			<StatefulChild label={props.label} childRef={props.childRef} onEffect={props.onEffect} />
		}
	</Host>
}
