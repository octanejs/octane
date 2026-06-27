import { useState, createContext, use } from 'octane';

// Regression fixtures for octane's JSX (`.tsx`) backwards-compat path:
//   1. `<Ctx.Provider value={…}>` with an ELEMENT-descriptor child (not a render-fn)
//      must render its children inside the provider's scope (so context flows).
//   2. A host element with COMPONENT children, produced via `createElement` from a
//      CONTROL-FLOW return (the de-opt path, NOT a static template), must render —
//      and RECONCILE across re-renders (the component child's state is preserved).
// Both were previously unsupported: the Provider ignored non-function children, and
// the de-opt host builder threw on component children.

const Ctx = createContext('default');

function CtxLeaf() {
	const v = use(Ctx);
	return <span className="leaf">{v as string}</span>;
}

// Multiple returns → the compiler emits `createElement` (de-opt path). The `on`
// branch is a HOST <div> whose children are COMPONENT descriptors.
function Wrapper(props: { on: boolean }) {
	if (props.on) {
		return (
			<div className="wrap">
				<CtxLeaf />
				<CtxLeaf />
			</div>
		);
	}
	return <span className="off">off</span>;
}

// `<Ctx.Provider>` (a built-in component) with a JSX descriptor child that is itself
// a host-with-components subtree.
export function ProviderApp() {
	return (
		<Ctx.Provider value="provided">
			<Wrapper on={true} />
		</Ctx.Provider>
	);
}

// --- reconcile / state-preservation across a re-render through the de-opt host ---

let _setCount: ((u: (n: number) => number) => void) | null = null;
let _forceParent: ((u: (n: number) => number) => void) | null = null;

export function bumpCount() {
	if (_setCount) _setCount((n) => n + 1);
}
export function reRenderParent() {
	if (_forceParent) _forceParent((n) => n + 1);
}

function Counter() {
	const [n, setN] = useState(0);
	_setCount = setN;
	return <span className="count">{n as number}</span>;
}

// Control-flow return → de-opt host path: a <div class="host"> with a STATEFUL
// component child.
function Host(props: { show: boolean }) {
	if (props.show) {
		return (
			<div className="host">
				<Counter />
			</div>
		);
	}
	return <span className="nohost">no</span>;
}

export function ReconcileApp() {
	const [, force] = useState(0);
	_forceParent = force;
	return <Host show={true} />;
}
