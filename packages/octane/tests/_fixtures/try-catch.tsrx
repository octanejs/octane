import { __runOnCatch, useState, useEffect } from 'octane';

// Inner component that throws on render when `props.bang` is true.
function ThrowsOnRender(props) @{
	if (props.bang) {
		throw new Error('render boom');
	}
	<p class="ok">{'rendered'}</p>
}

// Inner component that registers a useEffect that throws after mount.
function ThrowsInEffect(props) @{
	useEffect(
		(trigger) => {
			if (trigger) throw new Error('effect boom');
		},
		[props.bang],
	);
	<p class="ok">{'ok-for-now'}</p>
}

// Boundary catches render errors. Reset button re-attempts the try body.
export function RenderBoundary(props) @{
	<>
		@try {
			<div class="ok-wrap">
				<ThrowsOnRender bang={props.bang} />
			</div>
		} @catch (err, reset) {
			<div class="caught">
				<span class="msg">{err.message as string}</span>
				<button onClick={() => reset()}>{'retry'}</button>
			</div>
		}
	</>
}

// The catch arm records the reset function it receives on each render.
export function ResetIdentityBoundary(props: { label: string; resets: Array<() => void> }) @{
	@try {
		<ThrowsOnRender bang={true} />
	} @catch (err, reset) {
		props.resets.push(reset);
		<p class="caught">{props.label as string}</p>
	}
}

interface ReportingBoundaryProps {
	bang: boolean;
	label: string;
	state: { reported?: unknown };
	report: (error: unknown) => void;
	fromChild?: boolean;
}

function NestedCatchReporter(props: { report: (error: unknown) => void }) @{
	__runOnCatch(() => props.report('nested child'));
	<p>nested callback ran</p>
}

export function ReportingBoundary(props: ReportingBoundaryProps) @{
	@try {
		@try {
			<ThrowsOnRender bang={props.bang} />
		} @catch (error, reset) {
			if (!props.fromChild) __runOnCatch(() => props.report(error));
			<div class="reported-catch" data-reported={String(props.state.reported === error)}>
				@if (props.fromChild) {
					<NestedCatchReporter report={props.report} />
				}
				<span>{(props.label + ':' + (error as Error).message) as string}</span>
				<button onClick={() => reset()}>retry</button>
			</div>
		}
	} @catch (error) {
		<p class="reporting-outer">{String(error)}</p>
	}
}

// Boundary catches effect errors too.
export function EffectBoundary(props) @{
	<>
		@try {
			<div class="ok-wrap">
				<ThrowsInEffect bang={props.bang} />
			</div>
		} @catch (err) {
			<div class="caught">
				<span class="msg">{err.message as string}</span>
			</div>
		}
	</>
}

// Nested boundaries — outer is fallback; inner handles its own subtree first.
function AlwaysThrows() @{
	throw new Error('always');
	<p>{'never'}</p>
}

export function Nested() @{
	<>
		@try {
			<div class="outer">
				@try {
					<AlwaysThrows />
				} @catch (err) {
					<span class="inner-msg">{('inner: ' + err.message) as string}</span>
				}
			</div>
		} @catch (err) {
			<span class="outer-msg">{('outer: ' + err.message) as string}</span>
		}
	</>
}

// Boundary with state that should survive when the boundary stays in `try`.
export function StatefulInside() @{
	const [n, setN] = useState(0);
	<>
		@try {
			<div class="wrap">
				<button id="inc" onClick={() => setN(n + 1)}>
					{n as string}
				</button>
			</div>
		} @catch (err) {
			<span class="caught">{err.message as string}</span>
		}
	</>
}
