import { useEffect, useLayoutEffect } from 'octane';

function Leaf(props) @{
	useLayoutEffect((log) => {
		log.push(props.name);
		return () => log.push('~' + props.name);
	}, [props.log]);
	<span>{props.name}</span>
}
function Branch(props) @{
	<Leaf name="deep" log={props.log} />
}
// shallow (depth 1) is the FIRST sibling subtree; deep (depth 2) is in the SECOND.
// React fires shallow before deep (tree order), even though deep is deeper.
export function CrossDepth(props) @{
	<>
		<Leaf name="shallow" log={props.log} />
		<Branch log={props.log} />
	</>
}

function Parent(props) @{
	useLayoutEffect((log) => {
		log.push('parent');
	}, [props.log]);
	<Leaf name="child" log={props.log} />
}
export function ParentChild(props) @{
	<Parent log={props.log} />
}

function Multi(props) @{
	useLayoutEffect((log) => {
		log.push('first');
	}, [props.log]);
	useLayoutEffect((log) => {
		log.push('second');
	}, [props.log]);
	<span>{'m'}</span>
}
export function MultiEffect(props) @{
	<Multi log={props.log} />
}

// Ref attaches drain in the same post-order. Callback refs log when attached so the
// test can observe order: shallowRef (first subtree) before deepRef (deeper, second).
function RefLeaf(props) @{
	<span
		ref={(el) => {
			if (el) props.log.push(props.name);
		}}
	>{props.name}</span>
}
function RefBranch(props) @{
	<RefLeaf name="deepRef" log={props.log} />
}
export function CrossDepthRefs(props) @{
	<>
		<RefLeaf name="shallowRef" log={props.log} />
		<RefBranch log={props.log} />
	</>
}

// Each level owns both phases. A depth-only sort would place the later branch
// ahead of the shallow sibling, while an enqueue-only sort would place each
// ancestor ahead of its child.
function NestedLifecycle(props) @{
	useLayoutEffect((log, depth, version) => {
		log.push('layout ' + depth + ':' + version);
		return () => log.push('~layout ' + depth + ':' + version);
	}, [props.log, props.depth, props.version]);
	useEffect((log, depth, version) => {
		log.push('passive ' + depth + ':' + version);
		return () => log.push('~passive ' + depth + ':' + version);
	}, [props.log, props.depth, props.version]);
	@if (props.depth > 0) {
		<NestedLifecycle depth={props.depth - 1} version={props.version} log={props.log} />
	} @else {
		<span>{props.version}</span>
	}
}

export function NestedLifecycleOrder(props) @{
	<>
		<Leaf name="shallow" log={props.log} />
		<NestedLifecycle depth={props.depth} version={props.version} log={props.log} />
	</>
}
