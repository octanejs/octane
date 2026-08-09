/** @jsxImportSource octane */
import { memo, useState } from 'octane';

// React-style components whose output is chosen by plain `if`/ternary RETURNS.
// The semantic contract is dialect-independent: whatever compilation strategy
// the compiler picks (descriptor values or lowered template control flow), the
// rendered DOM, state retention, effects, and SSR/hydration must be identical.

export function Leaf(props: { path: string }) {
	return <span className="leaf">{props.path}</span>;
}

// Recursive multi-return tree — the spa-navigation `Node` shape.
export function Tree(props: { depth: number; path: string }) {
	if (props.depth > 0) {
		return (
			<div className="n">
				<Tree depth={props.depth - 1} path={props.path + 'L'} />
				<Tree depth={props.depth - 1} path={props.path + 'R'} />
			</div>
		);
	}
	return <Leaf path={props.path} />;
}

// Early-exit chain — the router-outlet shape.
export function Outlet(props: { route: string }) {
	if (props.route === 'a') {
		return (
			<section className="page-a">
				<Tree depth={2} path="a" />
			</section>
		);
	}
	if (props.route === 'b') return <article className="page-b">page b</article>;
	return <em className="page-missing">404</em>;
}

// Hooks in setup + a nullish guard + a ternary return. State must survive an
// arm flip (same component position) and reset on unmount.
export function Panel(props: { show: boolean; big: boolean }) {
	const [count, setCount] = useState(0);
	if (!props.show) return null;
	return props.big ? (
		<section className="panel big" onClick={() => setCount(count + 1)}>
			{'count:' + count}
		</section>
	) : (
		<div className="panel small" onClick={() => setCount(count + 1)}>
			{'count:' + count}
		</div>
	);
}

// A non-returning else path: its statements run, then the trailing return.
export function Logged(props: { fast: boolean; log: (entry: string) => void }) {
	if (props.fast) {
		return <b className="fast">fast</b>;
	}
	props.log('slow path');
	return <i className="slow">slow</i>;
}

// A fragment arm.
export function Split(props: { pair: boolean }) {
	if (props.pair) {
		return (
			<>
				<u className="one">1</u>
				<u className="two">2</u>
			</>
		);
	}
	return <u className="solo">solo</u>;
}

// Destructured props with conditional returns.
export function Badge({ kind, label }: { kind: string; label: string }) {
	if (kind === 'dot') return <s className="badge dot">{label}</s>;
	return <q className="badge pill">{label}</q>;
}

// memo-wrapped conditional-return component.
export const MemoTree = memo(Tree);

export function MemoHost(props: { depth: number }) {
	return (
		<div className="memo-host">
			<MemoTree depth={props.depth} path="m" />
		</div>
	);
}

// A helper the module CALLS DIRECTLY — it must stay an ordinary value-returning
// function no matter what lowering exists for component-shaped declarations.
// Module-private: exported components are HMR-wrapped in dev, which already
// makes direct calls unsupported.
function StampRow(props: { label: string }) {
	if (props.label === '') return <li className="stamp empty">(empty)</li>;
	return <li className="stamp">{props.label}</li>;
}

export function StampList(props: { first: string; second: string }) {
	return (
		<ul className="stamps">
			{StampRow({ label: props.first })}
			{StampRow({ label: props.second })}
		</ul>
	);
}

// An `unstable_use*`-named custom hook BEHIND an early return: its slot-keyed
// state lives on the component scope and must survive branch flips, exactly
// like a plain `use*` hook there.
function unstable_useCounter() {
	const [n, setN] = useState(0);
	return [n, setN] as const;
}

export function UnstableGuard(props: { ready: boolean }) {
	if (!props.ready) return <p className="pending">pending</p>;
	const [n, setN] = unstable_useCounter();
	return (
		<div className="ready" onClick={() => setN(n + 1)}>
			{'n:' + n}
		</div>
	);
}

// A `use*`-named function returning JSX is a HOOK, not a component — it must
// keep returning a renderable value to its caller.
export function useBadgeIcon(kind: string) {
	if (kind === 'dot') return <s className="icon dot">*</s>;
	return <q className="icon pill">o</q>;
}

export function IconHost(props: { kind: string }) {
	const icon = useBadgeIcon(props.kind);
	return <div className="icon-host">{icon}</div>;
}
