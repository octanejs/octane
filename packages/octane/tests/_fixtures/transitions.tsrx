import {
	use,
	useEffect,
	useLayoutEffect,
	useReducer,
	useState,
	useTransition,
	startTransition,
	useDeferredValue,
} from 'octane';

// ---------------------------------------------------------------------------
// useTransition basics — [isPending, start]. The setter returned from start
// runs `fn` synchronously; setters inside are tagged transition-priority.
// ---------------------------------------------------------------------------
export function TransitionBasics() @{
	const [n, setN] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<span id="n">{n as string}</span>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button id="bump-urgent" onClick={() => setN(n + 1)}>{'urgent'}</button>
		<button id="bump-transition" onClick={() => start(() => setN(n + 10))}>{'transition'}</button>
	</div>
}

// ---------------------------------------------------------------------------
// Transition suspend keeps prior DOM mounted — the canonical React 18
// "show old screen while new loads" pattern.
// ---------------------------------------------------------------------------
export function TransitionKeepsDom(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button id="swap" onClick={() => start(() => setPromise(props.nextPromise))}>{'swap'}</button>
		@try {
			const value = use(promise);
			<span id="value">{value as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// React 19 async Actions keep ordinary transition state on the last committed
// value until the Action's promise settles. The pending cue is urgent, while
// both the parent selection and its suspending child remain on the old screen.
// useReducer joins the same Action batch as useState.
export function AsyncActionKeepsCommittedState(props) @{
	const [selection, setSelection] = useState(props.initialSelection);
	const [count, setCount] = useState(0);
	const [reducerSelection, dispatchSelection] = useReducer(
		(_current, next) => next,
		props.initialSelection.id,
	);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<span id="parent-selection">{selection.id as string}</span>
		<span id="reducer-selection">{reducerSelection as string}</span>
		<span id="action-count">{count as string}</span>
		<button
			id="swap-action"
			onClick={() => start(async () => {
				setCount((value) => value + 10);
				await props.stageGate;
				startTransition(() => {
					setSelection(() => props.nextSelection);
					dispatchSelection(props.nextSelection.id);
				});
				await props.nextSelection.promise;
			})}
		>{'swap'}</button>
		<button id="urgent-count" onClick={() => setCount((value) => value + 1)}>{'urgent'}</button>
		@try {
			const value = use(selection.promise);
			<span id="action-value">{value as string}</span>
		} @pending {
			<span id="action-fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// startTransition as a STANDALONE function (no hook) — same priority
// tagging applies. Useful outside component bodies (e.g. event handlers
// that don't already use useTransition).
// ---------------------------------------------------------------------------
export function StandaloneStartTransition(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	<div>
		<button
			id="swap"
			onClick={() => startTransition(() => setPromise(props.nextPromise))}
		>{'swap'}</button>
		@try {
			const value = use(promise);
			<span id="value">{value as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// useDeferredValue with suspense — the deferred re-render runs at transition
// priority, so a suspending consumer keeps the prior DOM (no fallback flash).
// First render shows the prior value with isStale=true; microtask later, the
// new value commits, suspends, and the OLD DOM stays put until resolution.
// ---------------------------------------------------------------------------
export function DeferredValueWithSuspense(props) @{
	const deferred = useDeferredValue(props.promise);
	const isStale = props.promise !== deferred;
	<div>
		@try {
			const value = use(deferred);
			<span id="value" class={isStale ? 'stale' : 'fresh'}>{value as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Urgent updates preempt: an urgent setter after a transition setter forces
// the next render to be urgent. If that render suspends, the fallback SHOULD
// show (no DOM preservation, because the user explicitly asked for urgent).
// ---------------------------------------------------------------------------
export function UrgentPreemptsTransition(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	const [_, start] = useTransition();
	<div>
		<button
			id="swap-trans"
			onClick={() => start(() => setPromise(props.nextPromise))}
		>{'trans'}</button>
		<button id="swap-urgent" onClick={() => setPromise(props.nextPromise)}>{'urgent'}</button>
		@try {
			const value = use(promise);
			<span id="value">{value as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Two SIBLING try blocks each with their own promise, both swapped via a
// single startTransition. Both fetches must resolve before isPending=false
// — "entangled" transitions (React equivalent: ReactTransition-test.js:190).
// ---------------------------------------------------------------------------
function EntLeafA(props) @{
	<>
		@try {
			const v = use(props.p);
			<span class="ent-a">{'A:' + v as string}</span>
		} @pending {
			<span class="ent-a-load">{'A-load'}</span>
		}
	</>
}

function EntLeafB(props) @{
	<>
		@try {
			const v = use(props.p);
			<span class="ent-b">{'B:' + v as string}</span>
		} @pending {
			<span class="ent-b-load">{'B-load'}</span>
		}
	</>
}

export function EntangledTransitions(props) @{
	const [pA, setPA] = useState(props.initialA);
	const [pB, setPB] = useState(props.initialB);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="swap-both"
			onClick={() => start(() => {
				setPA(props.nextA);
				setPB(props.nextB);
			})}
		>{'swap'}</button>
		<EntLeafA p={pA} />
		<EntLeafB p={pB} />
	</div>
}

// ---------------------------------------------------------------------------
// Single try body with TWO sequential use() calls. The first resolves, the
// body replays, then the SECOND use() suspends. Under a transition, the
// retry must keep the prior DOM AND isPending stays true through both
// suspensions (React: ReactUse-test.js:1446 "does not get stuck in pending").
// ---------------------------------------------------------------------------
export function IsPendingThroughReplay(props) @{
	const [step, setStep] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<button id="swap" onClick={() => start(() => setStep(1))}>{'swap'}</button>
		@try {
			const a = use(step === 0 ? props.initialA : props.nextA);
			const b = use(step === 0 ? props.initialB : props.nextB);
			<span id="value">{a + '/' + b as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Nested startTransition — two separate useTransition hooks. Both `isPending`
// flags must be true while the inner transition is in flight, AND both flip
// to false on commit (React: ReactTransition-test.js:923).
// ---------------------------------------------------------------------------
export function NestedTransitions(props) @{
	const [n, setN] = useState(0);
	const [pendingA, startA] = useTransition();
	const [pendingB, startB] = useTransition();
	<div>
		<span id="pending-a">{'A:' + (pendingA ? '1' : '0') as string}</span>
		<span id="pending-b">{'B:' + (pendingB ? '1' : '0') as string}</span>
		<span id="n">{n as string}</span>
		<button
			id="nest"
			onClick={() => startA(() => startB(() => setN(props.target)))}
		>{'nest'}</button>
	</div>
}

// ---------------------------------------------------------------------------
// useDeferredValue inside a transition — should NOT defer. Both the input
// value and the deferred read commit in the same transition pass (React:
// ReactDeferredValue-test.js:108 "does not defer during a transition").
// ---------------------------------------------------------------------------
export function DeferredValueInTransition() @{
	const [v, setV] = useState(1);
	const [_, start] = useTransition();
	const deferred = useDeferredValue(v);
	<div>
		<span id="original">{'Original: ' + v as string}</span>
		<span id="deferred">{'Deferred: ' + deferred as string}</span>
		<button id="bump" onClick={() => start(() => setV(v + 1))}>{'bump'}</button>
	</div>
}

// ---------------------------------------------------------------------------
// Regression: the deferred-swap "deferred lane" tag applies ONLY to the
// deferred block's own re-render. startTransition notifies useTransition
// listeners synchronously (tickTransitionCount) around running its callback;
// a probe re-rendered by that notification mounts a fresh useDeferredValue,
// which must still show its preview — it is NOT part of the deferred pass.
// ---------------------------------------------------------------------------
function ListenerPreviewProbe(props) @{
	const text = useDeferredValue('Final', 'Preview');
	props.log('render:' + text);
	<span id="probe">{text as string}</span>
}

function TransitionPendingProbe(props) @{
	const [isPending] = useTransition();
	<div>
		@if (isPending) {
			<ListenerPreviewProbe log={props.log} />
		} @else {
			<span id="probe-idle">{'idle'}</span>
		}
	</div>
}

export function DeferredSpawnListenerApp(props) @{
	const [value, setValue] = useState(1);
	props.expose(setValue);
	const deferredValue = useDeferredValue(value);
	<div>
		<span id="deferred">{'Deferred: ' + deferredValue}</span>
		<TransitionPendingProbe log={props.log} />
	</div>
}

// ---------------------------------------------------------------------------
// Urgent supersede: a transition suspends on promise B, then an urgent
// setter swaps to promise C (already-resolved). The transition should be
// DISCARDED — isPending flips false, C is shown, and when B eventually
// resolves nothing happens (no-op retry).
// React equivalent: ReactUse-test.js:1631 "updates while component is
// suspended should not be mistaken for render phase updates".
// ---------------------------------------------------------------------------
export function UrgentSupersedesTransition(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="swap-trans"
			onClick={() => start(() => setPromise(props.transitionPromise))}
		>{'trans'}</button>
		<button id="swap-urgent" onClick={() => setPromise(props.urgentPromise)}>{'urgent'}</button>
		@try {
			const value = use(promise);
			<span id="value">{value as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Async startTransition (React 19 Actions). The action awaits `props.gate`
// before committing its setter; isPending must stay true until that promise
// SETTLES — not merely for one microtask. On settle (fulfil or reject) the
// pending flag drops exactly once.
// ---------------------------------------------------------------------------
export function AsyncStartTransition(props) @{
	const [n, setN] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<span id="n">{n as string}</span>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button
			id="go"
			onClick={() => start(async () => {
				await props.gate;
				setN(n + 1);
			})}
		>{'go'}</button>
	</div>
}

// ---------------------------------------------------------------------------
// Async action priority across `await`. The setter runs AFTER the await, by
// which point the synchronous slice (and TRANSITION_DEPTH) is long gone. It
// must still schedule at transition priority: when that post-await render
// suspends, the prior DOM is kept (no fallback flash) — the React 18/19
// "show old screen while new loads" behavior, now driven by an async action.
// ---------------------------------------------------------------------------
export function AsyncTransitionKeepsDom(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button
			id="go"
			onClick={() => start(async () => {
				await props.gate;
				setPromise(props.nextPromise);
			})}
		>{'go'}</button>
		@try {
			const value = use(promise);
			<span id="value">{value as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// The panel is the same component before and after the transition, so it
// updates its own attribute and heading straight away, and only then does the
// child under it start loading. React keeps the whole old screen up until the
// new one is ready, so nothing here should change early.
// ---------------------------------------------------------------------------
function AtomicityValue(props) @{
	const value = use(props.load(props.version));
	<span id="value">{value as string}</span>
}

function AtomicityPanel(props) @{
	<section id="panel" data-version={props.version as string}>
		<h2 id="heading">{'v' + props.version}</h2>
		<AtomicityValue version={props.version} load={props.load} />
	</section>
}

export function TransitionAtomicity(props) @{
	const [version, setVersion] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button
			id="bump"
			onClick={() => start(() => setVersion((value: number) => value + 1))}
		>{'bump'}</button>
		@try {
			<AtomicityPanel version={version} load={props.load} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Two leaves under one boundary. A transition moves both to the next step and
// then only the first one's data arrives, so replaying the body commits that
// leaf while the other suspends again. The boundary has to stay on the old step
// until both are ready.
// ---------------------------------------------------------------------------
function ResumeLeafA(props) @{
	const value = use(props.load('a', props.step));
	<span id="a">{value as string}</span>
}

function ResumeLeafB(props) @{
	const value = use(props.load('b', props.step));
	<span id="b">{value as string}</span>
}

export function TransitionResumeAtomicity(props) @{
	const [step, setStep] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button id="bump" onClick={() => start(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<ResumeLeafA load={props.load} step={step} />
				<ResumeLeafB load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// A namespaced attribute inside a boundary. The write goes through
// setAttributeNS, while the undo puts the old value back by qualified name —
// which has to land on the same namespaced attribute rather than adding a plain
// one beside it.
// ---------------------------------------------------------------------------
function NamespacedValue(props) @{
	const value = use(props.load(props.step));
	<span id="value">{value as string}</span>
}

export function TransitionNamespacedAttr(props) @{
	const [step, setStep] = useState(0);
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<svg>
					<use id="use-el" xlink:href={'#icon-' + step} />
				</svg>
				<NamespacedValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// A controlled input and checkbox inside a boundary. Their values live on the
// DOM properties AND in a per-element record, so a suspended transition has to
// put both back or the two disagree about what was last projected.
// ---------------------------------------------------------------------------
function ControlledValue(props) @{
	const value = use(props.load(props.step));
	<span id="value">{value as string}</span>
}

export function TransitionControlledInput(props) @{
	const [step, setStep] = useState(0);
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<input id="text" value={'step-' + step} onInput={() => {}} />
				<input id="box" type="checkbox" checked={step === 1} onChange={() => {}} />
				<ControlledValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// A radio group inside a boundary. Checking one radio makes the platform clear
// its same-name cousins, so by the time a cousin's own binding runs it has
// already been cleared — recording it there would capture the wrong state and
// the group would come back with nothing selected.
// ---------------------------------------------------------------------------
export function TransitionRadioGroup(props) @{
	const [step, setStep] = useState(0);
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<input id="r-a" type="radio" name="pick-group" checked={step === 1} onChange={() => {}} />
				<input id="r-b" type="radio" name="pick-group" checked={step === 0} onChange={() => {}} />
				<ControlledValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// A keyed list inside a boundary, with a suspending sibling after it. The
// transition drops a row and then the sibling suspends, so the list reconciles
// first and the boundary decides to hold second. The dropped row has to come
// back — DOM, its own state, and without having run its cleanup.
// ---------------------------------------------------------------------------
function RemovalRow(props) @{
	const [seen] = useState(props.id + '!');
	useEffect(() => {
		props.log('mount:' + props.id);
		return () => props.log('cleanup:' + props.id);
	}, []);
	<li id={'row-' + props.id}>{seen as string}</li>
}

export function TransitionKeyedRemoval(props) @{
	const [step, setStep] = useState(0);
	const items =
		step === 0 ? ['a', 'b', 'c'] : ['a', 'c'];
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<ul id="list">
					@for (const id of items; key id) {
						<RemovalRow id={id} log={props.log} />
					}
				</ul>
				<ControlledValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

export function TransitionListToEmpty(props) @{
	const [step, setStep] = useState(0);
	const items =
		step === 0 ? ['a', 'b'] : [];
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<ul id="list">
					@for (const id of items; key id) {
						<RemovalRow id={id} log={props.log} />
					} @empty {
						<li id="empty">{'nothing'}</li>
					}
				</ul>
				<ControlledValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// The transition ADDS a row and then a later sibling suspends. The fresh row
// completed its mount before the hold was decided, so putting the list back is
// not enough: the row's scope has to go too, or its queued mount effect fires
// for a row that is not on screen and nothing can ever clean it up.
// ---------------------------------------------------------------------------
function AddedRow(props) @{
	useEffect(() => {
		props.log('mount:' + props.id);
		return () => props.log('cleanup:' + props.id);
	}, []);
	<li id={'row-' + props.id}>{props.id as string}</li>
}

export function TransitionKeyedAddition(props) @{
	const [step, setStep] = useState(0);
	const items =
		step === 0 ? ['a'] : ['a', 'd'];
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<ul id="list">
					@for (const id of items; key id) {
						<AddedRow id={id} log={props.log} />
					}
				</ul>
				<ControlledValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// The same shape from an EMPTY list: 0 -> N has no rows to put back, but the
// freshly-filled rows still have to come out and their scopes go with them.
export function TransitionKeyedEmptyFill(props) @{
	const [step, setStep] = useState(0);
	const items =
		step === 0 ? [] : ['d'];
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<ul id="list">
					@for (const id of items; key id) {
						<AddedRow id={id} log={props.log} />
					}
				</ul>
				<ControlledValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// A value-position keyed list whose slot LEAVES array mode during the
// transition (the value flips to plain text), and then a later sibling
// suspends. The slot itself is discarded on the flip, so there is nothing for
// a rollback to restore the rows into — the teardown must run inline with the
// attempt, exactly as it did before rows learned to wait for a hold. The
// layout cleanups' position relative to the tail's render pins that.
// ---------------------------------------------------------------------------
function FlipRow(props) @{
	useLayoutEffect(() => {
		props.log('mount:' + props.id);
		return () => props.log('cleanup:' + props.id);
	}, []);
	<li id={'row-' + props.id}>{props.id as string}</li>
}

function FlipTail(props) @{
	props.log('render:tail:' + props.step);
	const value = use(props.load(props.step));
	<span id="value">{value as string}</span>
}

export function TransitionArrayModeExit(props) @{
	const [step, setStep] = useState(0);
	const rows =
		step === 0 ? ['a', 'b'] : null;
	<div>
		<button id="bump" onClick={() => startTransition(() => setStep(1))}>{'bump'}</button>
		@try {
			<>
				<div id="host">
					{rows === null ? 'plain' : rows.map((id) => <FlipRow key={id} id={id} log={props.log} />)}
				</div>
				<FlipTail load={props.load} step={step} log={props.log} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
