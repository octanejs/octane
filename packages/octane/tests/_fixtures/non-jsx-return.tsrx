import { createElement, memo, use, useState, useTransition } from 'octane';

// A component used at a `<Foo/>` site need not return JSX — it can return a
// primitive (coerced to text) or take an early return. "Component-ness" is the
// use-site, not the declaration; the renderable return-path coerces.
function Foo(props) {
	if (props.foo) return 123;
	return props.title;
}

export function App(props) @{
	<div>
		<Foo foo={props.foo} title={props.title} />
	</div>
}

// One ordinary return-based component covering every generic output shape the
// client runtime must continue reconciling when compiled-void applications
// tree-shake that machinery away.
export function Mixed(props) {
	if (props.mode === 'text') return props.label;
	if (props.mode === 'number') return 42;
	if (props.mode === 'null') return null;
	if (props.mode === 'void') return;
	if (props.mode === 'undefined') return undefined;
	if (props.mode === 'array') {
		return [
			createElement('i', { key: 'a', class: 'array-a' }, 'A'),
			createElement('i', { key: 'b', class: 'array-b' }, 'B'),
		];
	}
	return <button class="host">
		{props.label as string}
	</button>;
}

export function NestedMixed(props) @{
	<section>
		<Mixed mode={props.mode} label={props.label} />
	</section>
}

// A TSRX shorthand body may return a value before reaching its compiled
// template. The two output modes must not share the template binding bag or
// leave their previous DOM behind when props switch the reachable path.
function MixedInlineImpl(props) @{
	if (props.mode === 'null') return null;
	if (props.mode === 'text') return props.label;
	if (props.mode === 'void') return;
	if (props.mode === 'undefined') return undefined;

	<section class="mixed-inline">
		<span class="mixed-label">
			{props.label as string}
		</span>
		@if (props.detail) {
			<strong class="mixed-detail">detail</strong>
		}
	</section>
}

export const MixedInline = memo(MixedInlineImpl);

export function MixedFragment(props) @{
	if (props.empty) return null;

	<>
		<span class="mixed-fragment-a">
			{props.label as string}
		</span>
		<span class="mixed-fragment-b">B</span>
	</>
}

export function NestedMixedInline(props) @{
	<main class="mixed-parent">
		<MixedInline mode={props.mode} label={props.label} detail={props.detail} />
	</main>
}

export function MixedList(props) @{
	const prefix = props.prefix;
	if (!props.items) return null;

	<ul class="mixed-list">
		@for (const item of props.items; key item.id) {
			<li>
				{prefix + ':' + item.label}
			</li>
		}
	</ul>
}

function AwaitedValue(props) @{
	const value = use(props.promise);
	<span class="mixed-transition-value">
		{value as string}
	</span>
}

function MixedTransitionOutput(props) @{
	if (props.mode === 'text') return props.label;
	if (props.mode === 'returned') {
		return createElement(AwaitedValue, { promise: props.promise });
	}

	<section class="mixed-transition-inline" ref={props.onRef}>
		<AwaitedValue promise={props.promise} />
	</section>
}

export function MixedTransitionApp(props) @{
	const [mode, setMode] = useState(props.initialMode);
	const [promise, setPromise] = useState(props.initialPromise);
	const [isPending, start] = useTransition();

	<div>
		<button
			class="mixed-transition-swap"
			onClick={() => start(() => {
				setMode(props.nextMode);
				setPromise(props.nextPromise);
			})}
		>{'swap'}</button>
		<span class="mixed-transition-pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<div class="mixed-transition-stage">
			@try {
				<MixedTransitionOutput
					mode={mode}
					label="committed"
					promise={promise}
					onRef={props.onRef}
				/>
			} @pending {
				<i class="mixed-transition-fallback">fallback</i>
			}
		</div>
	</div>
}
