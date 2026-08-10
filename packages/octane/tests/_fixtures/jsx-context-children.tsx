/** @jsxImportSource octane */

import {
	Children,
	ErrorBoundary,
	Suspense,
	cloneElement,
	createContext,
	isValidElement,
	use,
	useState,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';

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

// --- pure-host DOM-state preservation across a re-render (the de-opt reconciler) ---

let _forceField: ((u: (n: number) => number) => void) | null = null;
let _forceList: ((u: (n: number) => number) => void) | null = null;

export function reRenderField() {
	if (_forceField) _forceField((n) => n + 1);
}
export function reRenderList() {
	if (_forceList) _forceList((n) => n + 1);
}

// Control-flow return → de-opt host VALUE path: a pure-host <input> (no component
// children). Its DOM node — and any DOM-resident state (value/focus) — must survive
// a parent re-render (reused, not rebuilt).
function Field(props: { show: boolean }) {
	if (props.show) {
		return <input className="field" type="text" />;
	}
	return <span className="nofield">no</span>;
}

export function InputApp() {
	const [, force] = useState(0);
	_forceField = force;
	return <Field show={true} />;
}

// A `.map()` of pure-host <input>s (lowers to the keyed forBlock fast path). Each
// input node must be reused across a parent re-render so typed values survive.
export function InputListApp() {
	const [, force] = useState(0);
	_forceList = force;
	return (
		<div className="list">
			{[0, 1, 2].map((i) => (
				<input className="li" data-idx={i as number} key={i as number} />
			))}
		</div>
	);
}

function DirectNestedLeaf() {
	const theme = use(Ctx);
	const [count, setCount] = useState(0);

	return (
		<button className="direct-nested-leaf" onClick={() => setCount((value) => value + 1)}>
			{`${theme}:${count}`}
		</button>
	);
}

function DirectNestedHost(props: { label: string }) {
	return (
		<section className="direct-nested-host" data-label={props.label}>
			<DirectNestedLeaf />
		</section>
	);
}

export function DirectNestedApp(props: { label: string; theme: string }) {
	return (
		<Ctx.Provider value={props.theme}>
			<DirectNestedHost label={props.label} />
		</Ctx.Provider>
	);
}

function StaticNestedLeaf() {
	return <span className="static-nested-leaf">static</span>;
}

function StaticNestedMiddle() {
	return (
		<div className="static-nested-middle">
			<StaticNestedLeaf />
		</div>
	);
}

export function StaticNestedApp() {
	return (
		<section className="static-nested-root">
			<i className="static-nested-before">before</i>
			<StaticNestedMiddle />
			<i className="static-nested-after">after</i>
		</section>
	);
}

function PrivateNestedLeaf() {
	return <span className="private-nested-leaf">private</span>;
}

function PrivateNestedMiddle() {
	return (
		<div className="private-nested-middle">
			<PrivateNestedLeaf />
		</div>
	);
}

export function PrivateNestedApp() {
	return (
		<section className="private-nested-root">
			<i className="private-nested-before">before</i>
			<PrivateNestedMiddle />
			<i className="private-nested-after">after</i>
		</section>
	);
}

export function directNestedReturnValue() {
	return StaticNestedLeaf();
}

export function directNestedMiddleReturnValue() {
	return StaticNestedMiddle();
}

function DescriptorEscapedLeaf() {
	return <span className="descriptor-escaped-leaf">descriptor</span>;
}

export function escapedNestedDescriptor() {
	const child = <DescriptorEscapedLeaf />;
	return child;
}

export function DescriptorEscapedApp() {
	return (
		<section className="descriptor-escaped-root">
			<DescriptorEscapedLeaf />
		</section>
	);
}

function MixedNestedShell() {
	return (
		<div className="mixed-nested-shell">
			<DirectNestedLeaf />
		</div>
	);
}

function MixedNestedHost() {
	return (
		<section className="mixed-nested-host">
			<StaticNestedMiddle />
			<MixedNestedShell />
		</section>
	);
}

export function MixedNestedApp(props: { theme: string }) {
	return (
		<Ctx.Provider value={props.theme}>
			<MixedNestedHost />
		</Ctx.Provider>
	);
}

let nestedDefaultEvents: string[] = [];
let nestedDefaultVersion = '';

function DefaultPropsPureLeaf() {
	return <span className="default-props-pure">pure</span>;
}

Object.defineProperty(DefaultPropsPureLeaf, 'defaultProps', {
	configurable: true,
	get() {
		const theme = use(Ctx);
		nestedDefaultEvents.push(`pure:${theme}:${nestedDefaultVersion}`);
		return {};
	},
});

function DefaultPropsStatefulLeaf(props: { label?: string }) {
	const [count, setCount] = useState(0);

	return (
		<button className="default-props-stateful" onClick={() => setCount((value) => value + 1)}>
			{`${props.label}:${count}`}
		</button>
	);
}

Object.defineProperty(DefaultPropsStatefulLeaf, 'defaultProps', {
	configurable: true,
	get() {
		const theme = use(Ctx);
		nestedDefaultEvents.push(`stateful:${theme}:${nestedDefaultVersion}`);
		return { label: `${theme}:${nestedDefaultVersion}` };
	},
});

function DefaultPropsNestedShell() {
	return (
		<div className="default-props-shell">
			<DefaultPropsPureLeaf />
			<DefaultPropsStatefulLeaf />
		</div>
	);
}

export function DefaultPropsNestedApp(props: { theme: string; version: string }) {
	nestedDefaultVersion = props.version;

	return (
		<Ctx.Provider value={props.theme}>
			<DefaultPropsNestedShell />
		</Ctx.Provider>
	);
}

export function resetNestedDefaultEvents() {
	nestedDefaultEvents = [];
}

export function readNestedDefaultEvents() {
	return nestedDefaultEvents.slice();
}

function FallbackPropLeaf(props: { label: string; kind: string }) {
	return <span data-fallback-kind={props.kind}>{props.label}</span>;
}

function FallbackRefLeaf(props: { ref?: (node: HTMLButtonElement | null) => void }) {
	return (
		<button className="fallback-ref" ref={props.ref}>
			ref
		</button>
	);
}

function FallbackKeyedLeaf() {
	const [count, setCount] = useState(0);

	return (
		<button className="fallback-keyed" onClick={() => setCount((value) => value + 1)}>
			{count}
		</button>
	);
}

function FallbackChildrenLeaf(props: { children: OctaneNode }) {
	const child = Children.only(props.children) as ElementDescriptor;

	return (
		<div className="fallback-children" data-valid={String(isValidElement(child))}>
			{cloneElement(child, {})}
		</div>
	);
}

export function NestedFallbackApp(props: {
	label: string;
	identity: string;
	onRef: (node: HTMLButtonElement | null) => void;
}) {
	return (
		<section className="nested-fallback-root">
			<FallbackPropLeaf label={props.label} kind="attribute" />
			<FallbackPropLeaf {...{ label: props.label, kind: 'spread' }} />
			<FallbackRefLeaf ref={props.onRef} />
			<FallbackKeyedLeaf key={props.identity} />
			<FallbackChildrenLeaf>
				<StaticNestedLeaf />
			</FallbackChildrenLeaf>
		</section>
	);
}

export function EscapedNestedApp() {
	const child = <StaticNestedLeaf />;
	const inspected = Children.only(child) as ElementDescriptor;

	return (
		<section className="escaped-nested-root" data-valid={String(isValidElement(inspected))}>
			{cloneElement(inspected, {})}
		</section>
	);
}

function ThrowingNestedLeaf() {
	throw new Error('nested child failed');
	return <span className="nested-unreachable">unreachable</span>;
}

function ThrowingNestedHost() {
	return (
		<div className="nested-error-host">
			<ThrowingNestedLeaf />
		</div>
	);
}

export function NestedErrorApp() {
	return (
		<ErrorBoundary fallback={<strong className="nested-error-fallback">caught</strong>}>
			<ThrowingNestedHost />
		</ErrorBoundary>
	);
}

const NestedPromiseContext = createContext<Promise<string> | null>(null);

function SuspendingNestedLeaf() {
	const promise = use(NestedPromiseContext);
	if (promise === null) throw new Error('missing nested promise');
	const value = use(promise);

	return <span className="nested-resolved">{value}</span>;
}

function SuspendingNestedHost() {
	return (
		<div className="nested-suspense-host">
			<SuspendingNestedLeaf />
		</div>
	);
}

export function NestedSuspenseApp(props: { promise: Promise<string> }) {
	return (
		<Suspense fallback={<span className="nested-pending">pending</span>}>
			<NestedPromiseContext.Provider value={props.promise}>
				<SuspendingNestedHost />
			</NestedPromiseContext.Provider>
		</Suspense>
	);
}
