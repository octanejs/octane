import { useLayoutEffect } from 'octane';

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
