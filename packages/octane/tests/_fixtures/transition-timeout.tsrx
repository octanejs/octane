import {
	startTransition,
	use,
	useInsertionEffect,
	useLayoutEffect,
	useState,
	useTransition,
} from 'octane';

// ============================================================================
// Transition-timeout fallback regressions
// ============================================================================
// React's `useTransition` contract: when a transition-priority render
// suspends on an already-committed try block, the prior DOM stays mounted
// (no fallback flash) — BUT only up to a configurable budget. After the
// timeout fires React commits the @pending body so the user gets visual
// feedback instead of staring at stale content indefinitely. isPending
// stays true through the fallback window because the transition is still
// in progress; on resolve, the saved try-body DOM is reattached.
//
// Mirrors ReactSuspenseWithNoopRenderer-test.js "eventually shows fallback
// if transition takes too long".

function SuspendingLeaf(props) @{
	const v = use(props.promise);
	const readyRef =
		v === props.readyValue ? props.readyRef : null;
	<span class="leaf" ref={readyRef}>
		{v as string}
	</span>
}

export function TimeoutFallback(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{(isPending ? '1' : '0') as string}
		</span>
		<button id="swap" onClick={() => start(() => setPromise(props.nextPromise))}>{'swap'}</button>
		@try {
			<SuspendingLeaf promise={promise} readyRef={props.readyRef} readyValue={props.readyValue} />
		} @pending {
			<span id="fallback">{'pending-shown'}</span>
		}
	</div>
}

function NestedRefChild(props) @{
	<span id="nested-ref-child" ref={props.childRef}>{'child'}</span>
}

function NestedRefTree(props) @{
	const value = use(props.promise);
	<div id="nested-ref-parent" ref={props.parentRef}>
		<NestedRefChild childRef={props.childRef} />
		<span>
			{value as string}
		</span>
	</div>
}

// After a timeout exposes @pending, the preserved primary's refs are detached.
// Reveal must publish descendant refs before ancestors just like an ordinary
// mount, so a parent callback can safely consume a child component's ref.
export function TimedNestedRefOrder(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	<div>
		<button
			id="nested-ref-swap"
			onClick={() => startTransition(() => setPromise(props.nextPromise))}
		>{'swap'}</button>
		@try {
			<NestedRefTree promise={promise} childRef={props.childRef} parentRef={props.parentRef} />
		} @pending {
			<span id="nested-ref-fallback">{'loading'}</span>
		}
	</div>
}

// Two queues updated by one transition stay entangled. If a later transition
// supersedes one of those queues after the timeout has exposed both fallbacks,
// the overlap still coordinates their reveal rather than committing half of
// the screen while the sibling remains pending.
function StagedReadyProbe(props) @{
	useLayoutEffect(() => {
		props.log.push('layout:' + props.value);
		if (props.revealLog) props.revealLog.push('A');
		props.onLayout?.();
	}, [props.log, props.value, props.revealLog, props.onLayout]);
	<span id="entangled-a" ref={props.readyRef}>
		{'A:' + props.value as string}
	</span>
}

function StagedBProbe(props) @{
	useLayoutEffect(() => {
		props.revealLog.push('B');
	}, [props.revealLog, props.value]);
	<span id="entangled-b">
		{'B:' + props.value as string}
	</span>
}

export function TimedEntangledSupersession(props) @{
	const [promiseA, setPromiseA] = useState(props.initialA);
	const [promiseB, setPromiseB] = useState(props.initialB);
	const [isPending, start] = useTransition();
	<div>
		<span id="entangled-pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="entangle-both"
			onClick={() => start(() => {
				setPromiseA(props.pendingA);
				setPromiseB(props.pendingB);
			})}
		>{'entangle'}</button>
		<button
			id="supersede-a"
			onClick={() => start(() => setPromiseA(props.replacementA))}
		>{'supersede A'}</button>
		<button
			id="resuspend-a"
			onClick={() => start(() => setPromiseA(props.pendingA2))}
		>{'resuspend A'}</button>
		@try {
			const valueA = use(promiseA);
			@if (valueA === 'a3') {
				<StagedReadyProbe
					value={valueA}
					readyRef={props.readyRef}
					log={props.log}
					revealLog={props.revealLog}
					onLayout={props.onLayout}
				/>
			} @else {
				<span id="entangled-a">
					{'A:' + valueA as string}
				</span>
			}
		} @pending {
			<span id="entangled-a-fallback">{'A loading'}</span>
		}
		@try {
			const valueB = use(promiseB);
			@if (props.revealLog) {
				<StagedBProbe value={valueB} revealLog={props.revealLog} />
			} @else {
				<span id="entangled-b">
					{'B:' + valueB as string}
				</span>
			}
		} @pending {
			<span id="entangled-b-fallback">{'B loading'}</span>
		}
	</div>
}

// A host ref and insertion effect complete before the later use() suspends.
// Hidden retries A and B update the SAME preserved host node; neither retry's
// commit work may escape while fallback is visible, and reveal must attach only
// the latest ref/effect payload.
function HiddenRetryCommitProbe(props) @{
	useInsertionEffect(() => {
		props.effectLog.push('setup:' + props.effectValue);
		return () => props.effectLog.push('cleanup:' + props.effectValue);
	}, [props.effectValue]);
	<>
		<span id="hidden-retry-ref" ref={props.activeRef}>
			{'ref:' + props.effectValue as string}
		</span>
		<SuspendingLeaf promise={props.tailPromise} />
	</>
}

export function TimedHiddenRetrySupersession(props) @{
	const [tailPromise, setTailPromise] = useState(props.initialTail);
	const [otherPromise, setOtherPromise] = useState(props.initialOther);
	const [refKind, setRefKind] = useState('none');
	const [effectValue, setEffectValue] = useState('old');
	const [isPending, start] = useTransition();
	const activeRef =
		refKind === 'a'
			? props.refA
			: refKind === 'b'
				? props.refB
				: null;
	<div>
		<span id="hidden-retry-pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="hide-hidden-retry"
			onClick={() => start(() => {
				setTailPromise(props.firstPendingTail);
				setOtherPromise(props.pendingOther);
			})}
		>{'hide'}</button>
		<button
			id="hidden-retry-a"
			onClick={() => start(() => {
				setRefKind('a');
				setEffectValue('a');
				setTailPromise(props.pendingTailA);
			})}
		>{'retry A'}</button>
		<button
			id="hidden-retry-b"
			onClick={() => start(() => {
				setRefKind('b');
				setEffectValue('b');
				setTailPromise(props.pendingTailB);
			})}
		>{'retry B'}</button>
		@try {
			<HiddenRetryCommitProbe
				activeRef={activeRef}
				effectLog={props.effectLog}
				effectValue={effectValue}
				tailPromise={tailPromise}
			/>
		} @pending {
			<span id="hidden-retry-fallback">{'primary loading'}</span>
		}
		@try {
			const other = use(otherPromise);
			<span id="hidden-retry-other">
				{'other:' + other as string}
			</span>
		} @pending {
			<span id="hidden-retry-other-fallback">{'other loading'}</span>
		}
	</div>
}

function ResumeEffectProbe(props) @{
	useLayoutEffect(() => {
		props.log.push('setup:' + props.value);
		return () => props.log.push('cleanup:' + props.value);
	}, [props.value]);
	<i id="resume-effect-probe">{'probe'}</i>
}

// On the first retry A has resolved, so the effect child renders with fresh
// deps, but B suspends later in the same preserved-block pass. That discarded
// retry must roll the hook cell back so the eventual same-deps replay queues it.
export function TimedResumeEffectRollback(props) @{
	const [promiseA, setPromiseA] = useState(props.initialA);
	const [promiseB, setPromiseB] = useState(props.initialB);
	const [value, setValue] = useState('old');
	const [isPending, start] = useTransition();
	<div>
		<span id="resume-effect-pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="resume-effect-swap"
			onClick={() => start(() => {
				setPromiseA(props.pendingA);
				setPromiseB(props.pendingB);
				setValue('new');
			})}
		>{'swap'}</button>
		@try {
			<>
				<SuspendingLeaf promise={promiseA} />
				<ResumeEffectProbe value={value} log={props.log} />
				<SuspendingLeaf promise={promiseB} />
			</>
		} @pending {
			<span id="resume-effect-fallback">{'loading'}</span>
		}
	</div>
}

function WaterfallA(props) @{
	const value = use(props.promise);
	useLayoutEffect(() => {
		props.log.push('layout:A:' + value);
	}, [props.log, value]);
	<span id="waterfall-a" ref={props.readyRef}>
		{'A:' + value as string}
	</span>
}

function WaterfallB(props) @{
	const key = use(props.firstPromise);
	const value = use(props.secondFor(key));
	useLayoutEffect(() => {
		props.log.push('layout:B:' + value);
	}, [props.log, value]);
	<span id="waterfall-b">
		{'B:' + value as string}
	</span>
}

// B's second thenable is data-dependent on its first, so it cannot be warmed
// in parallel. After fallback is visible, resolving B1 must retry the detached
// primary and discover B2 without marking B reveal-ready.
export function TimedHiddenDependentGroup(props) @{
	const [promiseA, setPromiseA] = useState(props.initialA);
	const [promiseB1, setPromiseB1] = useState(props.initialB1);
	const [isPending, start] = useTransition();
	<div>
		<span id="waterfall-pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="waterfall-start"
			onClick={() => start(() => {
				setPromiseA(props.pendingA);
				setPromiseB1(props.pendingB1);
			})}
		>{'start'}</button>
		@try {
			<WaterfallA promise={promiseA} readyRef={props.readyRef} log={props.log} />
		} @pending {
			<span id="waterfall-a-fallback">{'A loading'}</span>
		}
		@try {
			<WaterfallB firstPromise={promiseB1} secondFor={props.secondFor} log={props.log} />
		} @pending {
			<span id="waterfall-b-fallback">{'B loading'}</span>
		}
	</div>
}

function CatchCommitProbe(props) @{
	useLayoutEffect(() => {
		props.log.push('layout:catch');
	}, [props.log]);
	<span id="timeout-catch" ref={props.catchRef}>
		{props.message as string}
	</span>
}

export function TimedHiddenRejection(props) @{
	const [promise, setPromise] = useState(props.initialPromise);
	const [isPending, start] = useTransition();
	<div>
		<span id="rejection-pending">
			{isPending ? '1' : '0'}
		</span>
		<button
			id="reject-swap"
			onClick={() => start(() => setPromise(props.rejectedPromise))}
		>{'swap'}</button>
		@try {
			<SuspendingLeaf promise={promise} />
		} @pending {
			<span id="rejection-fallback">{'loading'}</span>
		} @catch (error) {
			<CatchCommitProbe message={error.message} catchRef={props.catchRef} log={props.log} />
		}
	</div>
}
