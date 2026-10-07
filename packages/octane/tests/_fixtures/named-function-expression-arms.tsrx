import { memo, useState } from 'octane';

interface Tree {
	id: string;
	children: Tree[];
}

// A named function expression binds its own name only inside its body. An arm
// hoisted out of that body must receive the name like any other local, or a
// recursive self-render reads it free at module scope.
export const RecursiveIf = memo(function Counter(props: {
	depth: number;
	max: number;
	label: string;
}) @{
	const [count, setCount] = useState(0);
	<section>
		<button onClick={() => setCount(count + 1)}>{`${props.label}${props.depth}:${count}`}</button>
		@if (props.depth < props.max) {
			<Counter depth={props.depth + 1} max={props.max} label={props.label} />
		}
	</section>
});

export const RecursiveFor = memo(function TreeNode(props: { node: Tree; suffix: string }) @{
	const [count, setCount] = useState(0);
	<li data-id={props.node.id}>
		<button
			onClick={() => setCount(count + 1)}
		>{`${props.node.id}${props.suffix}:${count}`}</button>
		<ul>
			@for (const child of props.node.children; key child.id) {
				<TreeNode node={child} suffix={props.suffix} />
			}
		</ul>
	</li>
});

export const RecursiveSwitch = memo(function Shape(props: { kind: string; suffix: string }) @{
	const [count, setCount] = useState(0);
	<div>
		<button onClick={() => setCount(count + 1)}>{`${props.kind}${props.suffix}:${count}`}</button>
		@switch (props.kind) {
			@case 'group': {
				<Shape kind="item" suffix={props.suffix} />
			}
			@default: {
				<span>{'leaf'}</span>
			}
		}
	</div>
});

// Declared inside a component, the expression's own name still binds only
// inside it, while its hoisted arm also reads the component's locals.
export function NestedIf(props: { label: string; max: number }) @{
	const label = props.label;
	const Inner = function Counter(inner: { depth: number }) @{
		const [count, setCount] = useState(0);
		<section>
			<button onClick={() => setCount(count + 1)}>{`${label}${inner.depth}:${count}`}</button>
			@if (inner.depth < props.max) {
				<Counter depth={inner.depth + 1} />
			}
		</section>
	};
	<Inner depth={0} />
}

// A declaration in a nested block of setup is not one of the component's
// top-level locals either, so its arm needs its own name threaded the same way.
export function BlockDeclaration(props: { label: string; max: number }) @{
	let Inner;
	{
		function Counter(inner: { depth: number }) @{
			const [count, setCount] = useState(0);
			<section>
				<button
					onClick={() => setCount(count + 1)}
				>{`${props.label}${inner.depth}:${count}`}</button>
				@if (inner.depth < props.max) {
					<Counter depth={inner.depth + 1} />
				}
			</section>
		}
		Inner = Counter;
	}
	<Inner depth={0} />
}
