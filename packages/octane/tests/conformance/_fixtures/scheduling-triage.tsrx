import { use, useState, useEffect, useLayoutEffect, startTransition } from 'octane';

// Fixtures for tests/conformance/scheduling-triage.test.ts — the Tier 6
// scheduling/lanes/batching triage ports (ReactFlushSync-test.js,
// ReactBatching-test.internal.js, ReactUpdatePriority-test.js,
// ReactIncrementalUpdates-test.js). Shared ordered log, drained per assertion.

let _log: string[] = [];
export function drainSchedLog(): string[] {
	return _log.splice(0);
}

// ---------------------------------------------------------------------------
// Plain text leaf — React's `Text` helper (logs on render). Driven through
// root.render(Plain, { text }) so re-renders take the scheduled (batched)
// path, not a setter.
// ---------------------------------------------------------------------------
export function Plain(props) @{
	_log.push('text:' + props.text);
	<span>
		{props.text as string}
	</span>
}

// ---------------------------------------------------------------------------
// Same shape but throws when armed via props — ReactFlushSync-test.js:293
// (queue exhaustion when a root's render throws). Keeping ONE body lets the
// re-render go through scheduleRender so all three roots are queued before
// the flush drains (a body swap would render synchronously and throw out of
// the flushSync callback before the sibling roots are queued).
// ---------------------------------------------------------------------------
export function ThrowSwitch(props) @{
	if (props.error) throw props.error;
	_log.push('text:' + props.text);
	<span>
		{props.text as string}
	</span>
}

// ---------------------------------------------------------------------------
// All-phase logger with an urgent setter — drives the flushSync/passive
// timing ports (ReactFlushSync-test.js:162/:246/:269, ReactBatching:77).
// `null` explicitly makes the effects re-fire after every render.
// ---------------------------------------------------------------------------
let _setPhaseTick: any = null;
export function bumpPhaseLogger(n: number) {
	_setPhaseTick(n);
}
export function PhaseLogger() @{
	const [n, setN] = useState(0);
	_setPhaseTick = setN;
	_log.push('render:' + n);
	useLayoutEffect(() => {
		_log.push('layout:' + n);
	}, null);
	useEffect(() => {
		_log.push('effect:' + n);
	}, null);
	<span id="phase">{'v' + n}</span>
}

// ---------------------------------------------------------------------------
// Two sibling cells updated at different priorities — the octane mapping of
// React's "flushSync flushes only its own lane" (ReactFlushSync-test.js:121,
// ReactBatching-test.internal.js:137): a pending TRANSITION render on one
// block vs a flushSync URGENT update on another.
// ---------------------------------------------------------------------------
let _setUrgentCell: any = null;
let _setTransitionCell: any = null;
export function bumpUrgentCell(n: number) {
	_setUrgentCell(n);
}
export function bumpTransitionCell(n: number) {
	startTransition(() => _setTransitionCell(n));
}
function UrgentCell() @{
	const [n, setN] = useState(0);
	_setUrgentCell = setN;
	<span id="lane-urgent">{'U' + n}</span>
}
function TransitionCell() @{
	const [n, setN] = useState(0);
	_setTransitionCell = setN;
	<span id="lane-transition">{'T' + n}</span>
}
export function LaneCells() @{
	<div>
		<UrgentCell />
		<TransitionCell />
	</div>
}

// ---------------------------------------------------------------------------
// setState inside a passive effect — ReactUpdatePriority-test.js:38: the
// spawned update must NOT commit as part of the flush that ran the effect;
// it lands in the next batch.
// ---------------------------------------------------------------------------
export function EffectSpawn() @{
	const [n, setN] = useState(1);
	useEffect(() => {
		if (n === 1) setN(2);
	}, []);
	<span id="es">
		{n as number}
	</span>
}

// ---------------------------------------------------------------------------
// A passive effect spawned by a TRANSITION render fires a setState whose
// re-render suspends. React gives updates scheduled inside passive effects
// the DEFAULT lane (the transition context is gone by effect time), so the
// suspend shows the FALLBACK rather than holding prior content. Octane's
// urgent priority is the analog of React's default here.
// ---------------------------------------------------------------------------
let _setSpawnStep: any = null;
export function spawnStepInTransition(n: number) {
	startTransition(() => _setSpawnStep(n));
}
export function PassiveSpawnSuspends(props) @{
	const [step, setStep] = useState(0);
	_setSpawnStep = setStep;
	useEffect(() => {
		if (step === 1) setStep(2);
	}, [step]);
	<div>
		@try {
			const value =
				step < 2 ? 'plain' + step : use(props.p2);
			<span id="ps-value">
				{value as string}
			</span>
		} @pending {
			<span id="ps-fallback">{'loading'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Mixed-priority dispatch order — ReactIncrementalUpdates-test.js:46. Two
// functional updates inside startTransition plus one urgent update in the
// same event. Final state must apply ALL updates in dispatch order ('bca'),
// matching React's full replay.
// ---------------------------------------------------------------------------
let _labelRenders = 0;
let _setLabel: any = null;
export function getLabelRenders() {
	return _labelRenders;
}
export function dispatchMixedPriority() {
	startTransition(() => {
		_setLabel((p) => p + 'b');
		_setLabel((p) => p + 'c');
	});
	_setLabel((p) => p + 'a');
}
export function LabelState() @{
	const [s, setS] = useState('');
	_setLabel = setS;
	_labelRenders++;
	<span id="label">
		{s as string}
	</span>
}
