/** @jsxImportSource octane */

import { useState } from 'octane';

// JSX twin of octane-tsrx's App.tsrx over the same octane core: same routes,
// same tree shape, authored React-style (JS control flow, `className`).

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

function Leaf(props: PathProps) {
	return <span className="leaf">{props.path}</span>;
}

function Node(props: NodeProps) {
	if (props.depth > 0) {
		return (
			<div className="n">
				<Node depth={props.depth - 1} path={props.path + 'L'} />
				<Node depth={props.depth - 1} path={props.path + 'R'} />
			</div>
		);
	}
	return <Leaf path={props.path} />;
}

function PageA() {
	return (
		<div className="page" data-page="a">
			<Node depth={D} path="a" />
		</div>
	);
}

function PageB() {
	return (
		<div className="page" data-page="b">
			<Node depth={D} path="b" />
		</div>
	);
}

function SectionX() {
	return (
		<div className="section" data-section="x">
			<Node depth={NESTED_D} path="x" />
		</div>
	);
}

function SectionY() {
	return (
		<div className="section" data-section="y">
			<Node depth={NESTED_D} path="y" />
		</div>
	);
}

function NestedLayout(props: NestedLayoutProps) {
	return (
		<div className="layout" data-layout="a">
			<div className="outlet-inner">{props.section === 'x' ? <SectionX /> : <SectionY />}</div>
		</div>
	);
}

function Outlet(props: RouteProps) {
	if (props.route === 'a') return <PageA />;
	if (props.route === 'b') return <PageB />;
	return <NestedLayout section={props.route === 'a/x' ? 'x' : 'y'} />;
}

export default function App(props: RouteProps) {
	const [route, setRoute] = useState(props.route);
	_setRoute = setRoute;
	return (
		<div className="shell">
			<nav className="nav">
				<span className="crumb">{route}</span>
			</nav>
			<div className="outlet" data-route={route}>
				<Outlet route={route} />
			</div>
		</div>
	);
}
