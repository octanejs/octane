// React-style render-prop children: a component takes a function child and
// CALLS it with data, rendering whatever descriptor it returns. The arrow body
// is bare JSX (`(data) => <span/>`), which the compiler lowers to a
// `createElement(...)` descriptor while preserving the arrow as a callable.

import { Suspense, type OctaneNode } from 'octane';

export function CallbackFallback(props: { fallback: () => string }) {
	const Render = () => <Suspense fallback={<span>{props.fallback() as string}</span>}>
		<span>ready</span>
	</Suspense>;
	return <Render />;
}

// Consumer that invokes its render-prop child with a value.
function Provide(props: { children: (value: string) => OctaneNode }) @{
	const value = 'hi';
	<div class="wrap">{props.children(value)}</div>
}

// Bare-JSX arrow render-prop returning a host element with an attribute and a
// nested text hole.
export function App() @{
	<Provide>
		{(v: string) => <span class="rendered" data-tag="x">{v}</span>}
	</Provide>
}

// Fragment arrow body — `(v) => <>…</>`. Lowers to an array of descriptors that
// the de-opt childSlot flattens, matching a React fragment render-prop.
export function AppFrag() @{
	<Provide>
		{(v: string) => <>
			<span class="rendered">{v}</span>
			<b class="extra">!</b>
		</>}
	</Provide>
}

function Evaluate(props: { children: (value: { current: string }) => OctaneNode }) @{
	const value = { current: 'during callback' };
	const result = props.children(value);
	value.current = 'after callback';
	<section>{result}</section>
}

export function CallbackEvaluation() @{
	<Evaluate>
		{(value: { current: string }) => <div data-value={value.current}>
			<span>{value.current as string}</span>
		</div>}
	</Evaluate>
}

export function FragmentCallbackEvaluation() @{
	<Evaluate>
		{(value: { current: string }) => <>
			<span>{value.current as string}</span>
			<b>{value.current as string}</b>
		</>}
	</Evaluate>
}
