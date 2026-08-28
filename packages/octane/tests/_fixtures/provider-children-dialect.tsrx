import { createContext, createElement, use, useContext, useLayoutEffect, useState } from 'octane';

const Ctx = createContext('none');

export function Reader() @{
	<span class="val">{useContext(Ctx) as string}</span>
}

function Passthrough(props) {
	return props.children ?? null;
}

// A plain-`.ts` component that forwards its children into a Provider, wrapping them in another
// component only in one of the two states. The Provider's `children` prop therefore alternates
// between the compiled children-block FUNCTION its `.tsrx` consumer passed and an element
// DESCRIPTOR — the two dialects a Provider must accept.
function DialectRoot(props) {
	return createElement(Ctx.Provider, {
		value: props.value,
		children: props.wrapped
			? createElement(Passthrough, { children: props.children })
			: props.children,
	});
}

export function ProviderChildrenDialectFlip() @{
	const [wrapped, setWrapped, getWrapped] = useState(false);
	<div>
		<button class="toggle" onClick={() => setWrapped(!getWrapped())}>toggle</button>
		<DialectRoot wrapped={wrapped} value="ctx">
			<Reader />
		</DialectRoot>
	</div>
}

// The same flip with live state inside the children, so a remount is observable as a reset.
function Counter() @{
	const [n, setN, getN] = useState(0);
	<button class="count" onClick={() => setN(getN() + 1)}>{'n' + n as string}</button>
}

export function ProviderChildrenDialectFlipWithState() @{
	const [wrapped, setWrapped, getWrapped] = useState(false);
	<div>
		<button class="toggle" onClick={() => setWrapped(!getWrapped())}>toggle</button>
		<DialectRoot wrapped={wrapped} value="ctx">
			<Counter />
		</DialectRoot>
	</div>
}

// The flip happening next to siblings in the same parent element: tearing the Provider's range
// down must not disturb anything outside it.
export function ProviderChildrenDialectFlipWithSiblings() @{
	const [wrapped, setWrapped, getWrapped] = useState(false);
	<div>
		<span class="before">before</span>
		<button class="toggle" onClick={() => setWrapped(!getWrapped())}>toggle</button>
		<DialectRoot wrapped={wrapped} value="ctx">
			<Reader />
		</DialectRoot>
		<span class="after">after</span>
	</div>
}

// A cleanup that throws while the Provider swaps dialects. The deletion happens mid-render rather
// than through the normal unmount path, so this checks the teardown error still reaches the
// enclosing boundary instead of being logged and swallowed.
type ThrowingCleanupProps = { failure?: Error; lifecycle?: string[] };

function ThrowingCleanup(props: ThrowingCleanupProps = {}) @{
	useLayoutEffect(() => {
		props.lifecycle?.push('connect');
		return () => {
			props.lifecycle?.push('cleanup');
			throw props.failure ?? new Error('cleanup-boom');
		};
	}, []);
	<span class="throwing" />
}

export function ProviderDialectFlipCleanupThrows(props: ThrowingCleanupProps = {}) @{
	const [wrapped, setWrapped, getWrapped] = useState(false);
	<div>
		<button class="toggle" onClick={() => setWrapped(!getWrapped())}>toggle</button>
		@try {
			<DialectRoot wrapped={wrapped} value="ctx">
				<ThrowingCleanup failure={props.failure} lifecycle={props.lifecycle} />
			</DialectRoot>
		} @catch (err) {
			<span class="caught">{(err.message ?? String(err)) as string}</span>
		}
	</div>
}

// Control: the SAME throwing cleanup torn down by an ordinary mid-render branch swap. Whatever
// the runtime does here is the established contract for a deletion that happens during render.
export function IfBranchSwapCleanupThrows() @{
	const [shown, setShown, getShown] = useState(true);
	<div>
		<button class="toggle" onClick={() => setShown(!getShown())}>toggle</button>
		@try {
			@if (shown) {
				<ThrowingCleanup />
			} @else {
				<span class="other" />
			}
		} @catch (err) {
			<span class="caught">{(err.message ?? String(err)) as string}</span>
		}
	</div>
}

// A ref-carrying compiled children body inside a Provider, under a Suspense boundary. The compiled
// body stamps a ref manifest on the Provider's scope; after a flip to the descriptor dialect the
// suspense-hide walk reads that manifest against whatever now sits in the scope's first slot.
export function ProviderRefFlipUnderSuspense(props) @{
	const [wrapped, setWrapped, getWrapped] = useState(false);
	<div>
		<button class="toggle" onClick={() => setWrapped(!getWrapped())}>toggle</button>
		@try {
			const value = use(props.promise);
			<DialectRoot wrapped={wrapped} value="ctx">
				<span class="reffed" ref={props.cbRef}>{value as string}</span>
			</DialectRoot>
		} @pending {
			<span class="pending-arm" />
		}
	</div>
}
