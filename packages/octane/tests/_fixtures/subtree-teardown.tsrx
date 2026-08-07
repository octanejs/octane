import { createPortal, useEffect, useState } from 'octane';

// A routed subtree deep enough that its teardown crosses many block boundaries,
// carrying the things whose DOM does NOT live inside the enclosing range: a
// portal into a foreign target, and a cleanup that reads the DOM.

let _setShown: ((value: boolean) => void) | null = null;
export function hideSubtree(): void {
	if (_setShown) _setShown(false);
}

function Leaf(props: { path: string; log: string[] }) @{
	useEffect(() => {
		return () => {
			props.log.push(`leaf:${props.path}`);
		};
	}, [props.path, props.log]);
	<span class="leaf">{props.path as string}</span>
}

function Node(props: { depth: number; path: string; log: string[] }) @{
	@if (props.depth > 0) {
		<div class="n">
			<Node depth={props.depth - 1} path={props.path + 'L'} log={props.log} />
			<Node depth={props.depth - 1} path={props.path + 'R'} log={props.log} />
		</div>
	} @else {
		<Leaf path={props.path} log={props.log} />
	}
}

function Page(props: { target: HTMLElement; log: string[] }) @{
	useEffect(() => {
		return () => {
			props.log.push('page');
		};
	}, [props.log]);
	<div class="page">
		<Node depth={4} path="p" log={props.log} />
		{createPortal(<span class="portaled">portaled</span>, props.target)}
	</div>
}

export function TeardownApp(props: { target: HTMLElement; log: string[] }) @{
	const [shown, setShown] = useState(true);
	_setShown = setShown;
	<div class="shell">
		@if (shown) {
			<Page target={props.target} log={props.log} />
		}
	</div>
}
