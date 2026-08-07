import { createSignal, createMemo } from 'solid-js';

// Solid 2.0 twin: same routes and tree shape as the octane fixtures.
//
// Solid component bodies run once, so the route switch lives in JSX where it
// becomes a fine-grained computation. The outer switch reads a memo of the
// TOP-LEVEL segment only, which is what keeps the nested layout alive across
// 'a/x' -> 'a/y', the same thing reconciliation gives the VDOM fixtures when
// the outlet returns the same component in the same position, and what a real
// Solid router does by matching per segment.

const D = 10; // 1024 leaves, 1023 interior nodes
const NESTED_D = 5; // 32 leaves, 31 interior nodes

let _setRoute = null;
export function navigate(route) {
	if (_setRoute) _setRoute(route);
}

function Leaf(props) {
	return <span class="leaf">{props.path}</span>;
}

function Node(props) {
	// props.depth / props.path are construction-time constants here.
	return props.depth > 0 ? (
		<div class="n">
			<Node depth={props.depth - 1} path={props.path + 'L'} />
			<Node depth={props.depth - 1} path={props.path + 'R'} />
		</div>
	) : (
		<Leaf path={props.path} />
	);
}

function PageA() {
	return (
		<div class="page" data-page="a">
			<Node depth={D} path="a" />
		</div>
	);
}

function PageB() {
	return (
		<div class="page" data-page="b">
			<Node depth={D} path="b" />
		</div>
	);
}

function SectionX() {
	return (
		<div class="section" data-section="x">
			<Node depth={NESTED_D} path="x" />
		</div>
	);
}

function SectionY() {
	return (
		<div class="section" data-section="y">
			<Node depth={NESTED_D} path="y" />
		</div>
	);
}

function NestedLayout(props) {
	return (
		<div class="layout" data-layout="a">
			<div class="outlet-inner">{props.section() === 'x' ? <SectionX /> : <SectionY />}</div>
		</div>
	);
}

export default function App(props) {
	const [route, setRoute] = createSignal(props.route);
	_setRoute = setRoute;
	// Only the top-level segment drives the outer swap.
	const top = createMemo(() => (route() === 'a' ? 'a' : route() === 'b' ? 'b' : 'nested'));
	const section = createMemo(() => (route() === 'a/x' ? 'x' : 'y'));
	return (
		<div class="shell">
			<nav class="nav">
				<span class="crumb">{route()}</span>
			</nav>
			<div class="outlet" data-route={route()}>
				{top() === 'a' ? <PageA /> : top() === 'b' ? <PageB /> : <NestedLayout section={section} />}
			</div>
		</div>
	);
}
