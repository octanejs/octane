// Pass-through wrapper used wherever react-router conditionally omits a boundary
// (Suspense / CatchBoundary / CatchNotFound / shellComponent). Rendering through
// SafeFragment instead of conditionally nesting the template keeps the boundary
// slot's component identity dynamic (`<Wrap>` where Wrap is Suspense or this) and
// — crucially — means a route WITHOUT a pendingComponent/errorComponent does not
// create a boundary at all, so suspensions and errors bubble to the nearest
// ancestor that has one (react-router parity).
// Props are `any` (upstream parity: react-router's `SafeFragment(props: any)`) —
// it stands in for Suspense/CatchBoundary/CatchNotFound/shellComponent at dynamic
// boundary slots, so it must accept any boundary's props and render only children.
export function SafeFragment(props: any) @{
	<>
		{props.children}
	</>
}
