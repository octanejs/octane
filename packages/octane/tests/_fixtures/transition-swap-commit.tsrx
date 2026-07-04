import { use, useState, useTransition } from 'octane';

// ---------------------------------------------------------------------------
// Fixtures for the transition probe-tax optimization: an incoming subtree
// swapped under startTransition should render its body EXACTLY ONCE per
// off-screen pass (the probe becomes the commit), not twice (probe + discard +
// in-place re-render). Each leaf logs its name on render via `props.log` so the
// tests can count body executions. Shapes: (a) @if via JSX ternary → ifBlock /
// renderBranchSlot, (b) @switch → switchBlock / renderBranchSlot, (c) dynamic
// `<Comp/>` → componentSlot, plus (d) a childSlot value-hole baseline.
// ---------------------------------------------------------------------------

function A(props) @{
	props.log('A');
	<span class="content">{'A'}</span>
}

function B(props) @{
	props.log('B');
	<span class="content">{'B'}</span>
}

// A version of B that suspends on mount (probe path): its off-screen render
// throws, is disposed, and the old content is held until the promise resolves.
function SusB(props) @{
	props.log('SusB');
	const v = use(props.promise);
	<span class="content">
		{'B-' + v as string}
	</span>
}

// (a) ifBlock / renderBranchSlot — a JSX ternary compiles to @if.
export function IfSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	const Incoming = props.suspend ? SusB : B;
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">
				{showB ? <Incoming log={props.log} promise={props.promise} /> : <A log={props.log} />}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// (b) switchBlock / renderBranchSlot.
export function SwitchSwap(props) @{
	const [n, setN] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<button id="go" onClick={() => start(() => setN(1))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">
				@switch (n) {
					@case 0: {
						<A log={props.log} />
					}
					@default: {
						<B log={props.log} />
					}
				}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// (c) componentSlot — a dynamic `<Comp/>` whose tag identity changes.
export function CompSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	const Comp =
		showB ? (props.suspend ? SusB : B) : A;
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">
				<Comp log={props.log} promise={props.promise} />
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// (d) childSlot baseline — a value-hole fed by a local whose component identity
// changes. Serves as the render-count reference the committed component/branch
// paths must now match (both should log the incoming body the SAME number of
// times per swap).
export function ChildSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	const node = showB ? <B log={props.log} /> : <A log={props.log} />;
	<div>
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			<div class="slot">{node}</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// Double-swap driver A→B→A under transitions, at the @if branch position — proves
// the adopted-marker / exclusiveMarkers bookkeeping survives successive commits.
export function IfDoubleSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	<div>
		<button id="toB" onClick={() => start(() => setShowB(true))}>{'toB'}</button>
		<button id="toA" onClick={() => start(() => setShowB(false))}>{'toA'}</button>
		@try {
			<div class="slot">
				{showB ? <B log={props.log} /> : <A log={props.log} />}
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// Double-swap at the componentSlot position.
export function CompDoubleSwap(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	const Comp = showB ? B : A;
	<div>
		<button id="toB" onClick={() => start(() => setShowB(true))}>{'toB'}</button>
		<button id="toA" onClick={() => start(() => setShowB(false))}>{'toA'}</button>
		@try {
			<div class="slot">
				<Comp log={props.log} />
			</div>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
