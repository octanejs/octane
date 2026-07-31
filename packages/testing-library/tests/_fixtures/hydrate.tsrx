import { useState, useEffect, createElement, type OctaneNode } from 'octane';

interface CounterProps {
	label: string;
	// Optional because the server twin below does not pass them: useEffect is a
	// no-op on the server, so only the hydrating client ever calls these.
	onMount?: () => void;
	onUnmount?: () => void;
}

// Fixtures for the `hydrate: true` render option. A mount-once effect plus a
// click-driven counter is the smallest shape that can prove the three things
// hydration promises a test author: the server's nodes were adopted rather than
// replaced, the mount effect ran once over them, and they are live afterwards.
export function HydratableCounter(props: CounterProps) @{
	const [count, setCount] = useState(0);
	useEffect(() => {
		props.onMount?.();
		return () => props.onUnmount?.();
	}, []);
	<div data-testid="counter">
		<p data-testid="label">{props.label as string}</p>
		<button data-testid="button" onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>
	</div>
}

// `wrapper` render-option target (the same shape as basic.tsrx's MainWrapper).
export function HydrateWrapper(props: { children: OctaneNode }) @{
	<main data-testid="wrapper">{props.children}</main>
}

// Server-side twin of `render(HydratableCounter, { wrapper: HydrateWrapper })`.
//
// It repeats HydrateWrapper's markup instead of rendering <HydrateWrapper>,
// because the twin has to match the client's tree SHAPE, not just its HTML. The
// render option makes the wrapper the ROOT component
// (`createElement(Wrapper, { children: createElement(ui, props) })`), and a root
// renders anchorless; delegating to <HydrateWrapper> from here would put a
// second component range around the same markup, and the client then reports
// "expected <div> but the server rendered a control-flow block" and rebuilds.
// The child is built with createElement for the same reason — it must arrive in
// value position, as `props.children` does, not as an inline component range.
export function WrappedCounter(props: { label: string }) @{
	<main data-testid="wrapper">{createElement(HydratableCounter, { label: props.label })}</main>
}
