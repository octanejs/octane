import { useState } from 'octane';

interface Tree {
	id: string;
	children: Tree[];
}

// `const X = function Name() @{…}` binds `Name` only inside the component, while
// the module binds the component as `X`. A self-render by `Name` must reach the
// component from its setup, its warm plan, and every hoisted arm.
export const RecursiveIf = function Counter(props: { depth: number; max: number; label: string }) @{
	const [count, setCount] = useState(0);
	<section>
		<button onClick={() => setCount(count + 1)}>{`${props.label}${props.depth}:${count}`}</button>
		@if (props.depth < props.max) {
			<Counter depth={props.depth + 1} max={props.max} label={props.label} />
		}
	</section>
};

export const RecursiveFor = function TreeNode(props: { node: Tree; suffix: string }) @{
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
};

export const RecursiveSwitch = function Shape(props: { kind: string; suffix: string }) @{
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
};

// The module's own `Leaf` is a different component. Inside the expression,
// `Leaf` still names the expression itself.
export const Leaf = () => @{
	<span>{'module leaf'}</span>
};

export const Shadowed = function Leaf(props: { depth: number; max: number; label: string }) @{
	const [count, setCount] = useState(0);
	<section>
		<button onClick={() => setCount(count + 1)}>{`${props.label}${props.depth}:${count}`}</button>
		@if (props.depth < props.max) {
			<Leaf depth={props.depth + 1} max={props.max} label={props.label} />
		}
	</section>
};

// One declarator of several.
export const offset = 1,
	Multi = function Counter(props: { depth: number; max: number; label: string }) @{
		const [count, setCount] = useState(0);
		<section>
			<button
				onClick={() => setCount(count + offset)}
			>{`${props.label}${props.depth}:${count}`}</button>
			@if (props.depth < props.max) {
				<Counter depth={props.depth + 1} max={props.max} label={props.label} />
			}
		</section>
	};
