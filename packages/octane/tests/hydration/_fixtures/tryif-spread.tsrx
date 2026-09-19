// SSR Phase 6 regression — the EXACT router nesting around a layout route whose
// root element carries a SPREAD, reproduced without the router package:
//
//   Matches:  <>  <Sib/>  @if (firstId) { <Match/> }  </>      (fragment + sibling)
//   Match:    <Ctx> @try { @if (Comp) { <Comp/> } @else { <Outlet/> } } @pending {…}
//   Comp:     <header {...attrs} data-n={n}>…  (a hooked layout root with a spread)
//
// Comp does NOT suspend (a layout like RootLayout), so the @try renders its success
// arm directly. Pre-fix, the SOLE-hole control-flow blocks (@try / @if that are the
// only thing an enclosing component/arm renders) minted fresh markers instead of
// adopting the server `<!--[-->` range and never advanced the hydration cursor — so
// a descendant component's clone() adopted the wrong node and setSpread threw
// `el.setAttribute is not a function`.
import { createContext, useState, useRef, useLayoutEffect, useEffect } from 'octane';

const Ctx = createContext('none');

// A hooked component whose ROOT element carries a spread (the RootLayout shape).
// The hook routes it through the HOOKED `componentSlot` path (not lite).
function SpreadRoot(props) @{
	const [n] = useState(0);
	<header {...props.attrs} data-n={n}>{props.label as string}</header>
}

function FallbackOutlet() @{
	<div class="outlet">{'outlet' as string}</div>
}

// A sibling so the outer @if is NOT a sole hole — mirrors <Transitioner/> next to
// the first <Match/> in the router's Matches component. Like Transitioner it is
// HOOKED and renders an EMPTY fragment `<></>` (renders nothing): the cursor must
// advance past its empty server `<!--[-->…<!--]-->` range to reach the @if.
function Sib() @{
	const r = useRef(0);
	void r;
	<></>
}

// Mirrors the router `Match`: Provider > @try > @if (truthy) { <Comp/> } @else {…}.
function InnerMatch(props) @{
	<Ctx value={props.label}>
		@try {
			@if (props.show) {
				<SpreadRoot attrs={props.attrs} label={props.label} />
			} @else {
				<FallbackOutlet />
			}
		} @pending {
			<span class="loading">{'loading'}</span>
		}
	</Ctx>
}

// Mirrors the router `Matches`: a FRAGMENT (no wrapper element) whose first child is
// an empty sibling component and whose second is `@if (firstId) { <Match/> }`. A
// fragment-returning component is rendered via componentSlot's singleRoot path when
// NESTED (not as the hydrate root) — the actual app shape.
export function MatchesLike(props) @{
	// Hooks like the real <Matches/> (useStore + useLayoutEffect).
	const [n] = useState(0);
	useLayoutEffect(() => {}, []);
	void n;
	<>
		<Sib />
		@if (props.show) {
			<InnerMatch show={props.show} label={props.label} attrs={props.attrs} />
		}
	</>
}

// A context-provider wrapper that renders its children via a `{props.children}` hole
// (childSlot). The QueryClientProvider/RouterProvider stack in the real app is this
// shape, and the `.tsx` entry passes their children as createElement DESCRIPTORS (not
// render-fns) — the test builds that descriptor chain with createElement directly.
export function Wrap(props) @{
	// A hook like QueryClientProvider's useEffect.
	useEffect(() => {}, []);
	<Ctx value={props.value}>{props.children}</Ctx>
}

// Mirrors RouterProvider EXACTLY: a context provider that renders the
// fragment-returning component as a DIRECT .tsrx child (a render-fn → componentSlot
// INLINE), not via a `{props.children}` descriptor hole. This is the extra component
// layer that distinguishes the real app from a plain provider stack.
export function RPLike(props) @{
	<Ctx value="rp">
		<MatchesLike show={props.show} label={props.label} attrs={props.attrs} />
	</Ctx>
}

// The hydrate root. Renders <MatchesLike/> NESTED (via componentSlot) so the
// fragment-returning component is adopted through the singleRoot path — exactly how
// the router's <Matches/> is rendered under RouterProvider in the real app.
export function MatchSpread(props) @{
	<div id="root">
		<MatchesLike show={props.show} label={props.label} attrs={props.attrs} />
	</div>
}
