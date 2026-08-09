import { useState } from 'octane';

// SPA full-page navigation: the app shell stays mounted while the routed
// subtree is torn down and rebuilt. Two top-level routes ('a', 'b') each render
// a 1024-leaf tree, and one nested pair ('a/x', 'a/y') renders a 32-leaf section
// inside a shared layout, so a nested navigation is the case where a framework
// that reuses the surviving wrappers does far less work. See ../run.mjs for the
// navigations the harness times over this shape.
//
// The shell and layout DOM nodes must survive their navigations by identity;
// the harness asserts that, so "less work" can never mean "rebuilt anyway".

const D = 10; // 1024 leaves, 1023 interior nodes
const NESTED_D = 5; // 32 leaves, 31 interior nodes

type Route = 'a' | 'b' | 'a/x' | 'a/y';

interface PathProps {
	path: string;
}

interface NodeProps extends PathProps {
	depth: number;
}

interface NestedLayoutProps {
	section: 'x' | 'y';
}

interface RouteProps {
	route: Route;
}

let _setRoute: ((route: Route) => void) | null = null;
export function navigate(route: Route) {
	if (_setRoute) _setRoute(route);
}

function Leaf(props: PathProps) @{
	<span class="leaf">{props.path as string}</span>
}

function Node(props: NodeProps) @{
	@if (props.depth > 0) {
		<div class="n">
			<Node depth={props.depth - 1} path={props.path + 'L'} />
			<Node depth={props.depth - 1} path={props.path + 'R'} />
		</div>
	} @else {
		<Leaf path={props.path} />
	}
}

function PageA() @{
	<div class="page" data-page="a">
		<Node depth={D} path="a" />
	</div>
}

function PageB() @{
	<div class="page" data-page="b">
		<Node depth={D} path="b" />
	</div>
}

function SectionX() @{
	<div class="section" data-section="x">
		<Node depth={NESTED_D} path="x" />
	</div>
}

function SectionY() @{
	<div class="section" data-section="y">
		<Node depth={NESTED_D} path="y" />
	</div>
}

// The nested layout survives an x -> y navigation: same component, same
// position, so only its routed child is replaced.
function NestedLayout(props: NestedLayoutProps) @{
	<div class="layout" data-layout="a">
		<div class="outlet-inner">
			@if (props.section === 'x') {
				<SectionX />
			} @else {
				<SectionY />
			}
		</div>
	</div>
}

export default function App(props: RouteProps) @{
	const [route, setRoute] = useState(props.route);
	_setRoute = setRoute;
	<div class="shell">
		<nav class="nav">
			<span class="crumb">{route as string}</span>
		</nav>
		<div class="outlet" data-route={route}>
			@switch (route) {
				@case 'a': {
					<PageA />
				}
				@case 'b': {
					<PageB />
				}
				@default: {
					<NestedLayout section={route === 'a/x' ? 'x' : 'y'} />
				}
			}
		</div>
	</div>
}
