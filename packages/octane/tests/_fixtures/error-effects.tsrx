import { useEffect, useLayoutEffect, useMemo, useState } from 'octane-ts';

// ── Effect-throw fixtures ────────────────────────────────────────────────
// Per ReactErrorBoundaries-test.internal.js:407 — BrokenUseEffect: renders its
// children, then throws "Hello" from a useEffect body.
function BrokenUseEffect(props) @{
	useEffect(() => {
		props.log?.('BrokenUseEffect useEffect [!]');
		throw new Error('Hello');
	}, []);
	<span class="child">{'Initial value'}</span>
}

// Per ReactErrorBoundaries-test.internal.js:418 — BrokenUseLayoutEffect: throws
// "Hello" from a useLayoutEffect body instead.
function BrokenUseLayoutEffect(props) @{
	useLayoutEffect(() => {
		props.log?.('BrokenUseLayoutEffect useLayoutEffect [!]');
		throw new Error('Hello');
	}, []);
	<span class="child">{'Initial value'}</span>
}

// Boundary mirrors React's ErrorBoundary fallback: "Caught an error: <msg>."
export function UseEffectBoundary(props) @{
	<>
		@try {
			<div class="ok-wrap">
				<BrokenUseEffect log={props.log} />
			</div>
		} @catch (err) {
			<div class="caught">
				{'Caught an error: ' + err.message + '.' as string}
			</div>
		}
	</>
}

export function UseLayoutEffectBoundary(props) @{
	<>
		@try {
			<div class="ok-wrap">
				<BrokenUseLayoutEffect log={props.log} />
			</div>
		} @catch (err) {
			<div class="caught">
				{'Caught an error: ' + err.message + '.' as string}
			</div>
		}
	</>
}

// ── Hook-order preservation across catch ─────────────────────────────────
// Per ReactErrorBoundariesHooks-test.internal.js:25 — ErrorThrower calls a hook
// (useMemo) BEFORE throwing, so the boundary must commit without corrupting the
// sibling's hook state when it re-renders.
function ErrorThrower() @{
	useMemo(() => undefined, []);
	throw new Error('expected');
	<span>{'never'}</span>
}

// Per ReactErrorBoundariesHooks-test.internal.js:30 — sibling that owns a useState
// hook; its " | stateful" text must keep rendering across the catch + re-render.
function StatefulComponent(props) @{
	const [n] = useState(0);
	<span class="stateful">
		{' | stateful=' + n as string}
	</span>
}

// Per ReactErrorBoundariesHooks-test.internal.js:50 — App: boundary around the
// thrower, with the stateful sibling rendered alongside it.
export function HookOrderApp() @{
	<>
		@try {
			<ErrorThrower />
		} @catch (err) {
			<p class="handled">
				{'Handled error: ' + err.message as string}
			</p>
		}
		<StatefulComponent />
	</>
}
