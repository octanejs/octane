import { useState, type OctaneNode } from 'octane';

function Before() @{
	<i id="text-before">before</i>
}

function After() @{
	<i id="text-after">after</i>
}

function uppercase(value: string): string {
	return value.toUpperCase();
}

export function TextScene(props: {
	label: string;
	maybe: string | null;
	child: OctaneNode;
}) @{
	const [count, setCount] = useState(0);
	const { label } = props;
	<main>
		<button id="text-bump" onClick={() => setCount(count + 1)}>increment</button>
		<section id="text-siblings">
			<Before />
			{label}
			<After />
		</section>
		<span id="text-member">{props.label}</span>
		<span id="text-return">{uppercase(props.label)}</span>
		<span id="text-count">{String(count)}</span>
		<span id="text-nullable">{props.maybe}</span>
		<div id="text-renderable">{props.child}</div>
	</main>
}
