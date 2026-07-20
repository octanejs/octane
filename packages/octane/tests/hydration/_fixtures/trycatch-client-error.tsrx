import { useState } from 'octane';

// Hydration recovery for @try/@catch: the server rendered the SUCCESS arm, but on
// the client the try body throws during hydration (the website analogue: a route
// module fails to import on a hot dev server). The boundary must mount its @catch
// arm without crashing and without disturbing the sibling DOM around the slot.

function Inner(props) @{
	if (props.boom) throw new Error('boom');
	const [n, setN] = useState(0);
	<button id="ok" onClick={() => setN(n + 1)}>{'ok:' + n}</button>
}

export function Page(props) @{
	<div id="page">
		<h1 id="before">Title</h1>
		@try {
			<Inner boom={props.boom} />
		} @catch (err, reset) {
			<div class="err">
				<span class="msg">{'caught:' + err.message}</span>
				<button class="retry" onClick={() => reset()}>
					retry
				</button>
			</div>
		}
		<p id="after">after</p>
	</div>
}

// The router pipeline shape from the live report (tanstack-router's global
// CatchBoundary > @if > Match > CatchNotFound): the outer boundary's try arm is
// an @if whose branch renders an INNER boundary whose @catch RETHROWS every
// error (the notFound-forwarding shape). The rethrown error must reach the
// OUTER @catch intact — during hydration adoption AND on a later reset()
// re-mount while the leaf still throws (a route module that stays broken).
function RethrowView(props) {
	throw props.err;
}

function InnerRethrow(props) @{
	@try {
		<Inner boom={props.boom} />
	} @catch (err) {
		<RethrowView err={err} />
	}
}

export function RouterShape(props) @{
	<div id="router">
		<h1 id="before">Title</h1>
		@try {
			@if (props.show) {
				<InnerRethrow boom={props.boom} />
			}
		} @catch (err, reset) {
			<div class="outer-err">
				<span class="msg">{'outer:' + err.message}</span>
				<button class="retry" onClick={() => reset()}>
					retry
				</button>
			</div>
		}
		<p id="after">after</p>
	</div>
}

// The router Match shape from the live report: TWO nested boundaries (root route +
// leaf route), the inner one owning the throwing component. The inner boundary
// catches; the outer boundary and its surrounding DOM must survive.
export function NestedPage(props) @{
	<div id="nested">
		<h1 id="before">Title</h1>
		@try {
			<section class="outer">
				@try {
					<Inner boom={props.boom} />
				} @catch (err) {
					<div class="inner-err">{'inner:' + err.message}</div>
				}
				<span id="outer-tail">tail</span>
			</section>
		} @catch (err) {
			<div class="outer-err">{'outer:' + err.message}</div>
		}
		<p id="after">after</p>
	</div>
}
