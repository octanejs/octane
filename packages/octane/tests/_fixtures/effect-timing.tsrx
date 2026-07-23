import { useEffect, useLayoutEffect, useInsertionEffect, useRef, useState } from 'octane';

// Three-phase ordering: insertion fires sync-before-layout-before-paint;
// passive fires after paint. Cleanups of each phase fire before that phase's
// new bodies (React's "all old cleanups before any new bodies" guarantee).
//
// Bodies close over props lexically. octane ALSO spreads deps as
// positional args, but lexical capture works in both runtimes — required
// for differential parity (React calls effect bodies with zero args).
export function PhaseOrder(props) @{
	useEffect(() => {
		props.log.push('eff:body');
		return () => props.log.push('eff:cleanup');
	}, [props.tick, props.log]);
	useLayoutEffect(() => {
		props.log.push('lay:body');
		return () => props.log.push('lay:cleanup');
	}, [props.tick, props.log]);
	useInsertionEffect(() => {
		props.log.push('ins:body');
		return () => props.log.push('ins:cleanup');
	}, [props.tick, props.log]);
	<div>{'x'}</div>
}

// useLayoutEffect runs AFTER the DOM commit — it can read the committed DOM.
export function LayoutReadsDom(props) @{
	useLayoutEffect((onCommit) => {
		const w = document.querySelector('#measured');
		onCommit(w == null ? null : w.outerHTML);
	}, [props.onCommit]);
	<div id="measured" style="width: 100px">{'A'}</div>
}

// Layout fires synchronously inside flushSync; passive does not.
export function PassiveDeferred(props) @{
	useLayoutEffect(() => {
		props.log.push('layout');
	}, [props.tick, props.log]);
	useEffect(() => {
		props.log.push('passive');
	}, [props.tick, props.log]);
	<span>{'z'}</span>
}

// Models an imperative integration (a chart/canvas library, for example) that
// installs one artifact and removes exactly that artifact from its cleanup.
// Back-to-back dependency changes must never leave both revisions installed.
export function CoalescedPassiveArtifact(props: { label: string; log: string[] }) @{
	const host = useRef<HTMLDivElement | null>(null);
	props.log.push('render:' + props.label);
	useEffect(() => {
		const artifact = document.createElement('span');
		artifact.dataset.label = props.label;
		host.current!.appendChild(artifact);
		props.log.push('body:' + props.label);
		return () => {
			props.log.push('cleanup:' + props.label);
			artifact.remove();
		};
	}, [props.label, props.log]);
	<div id="coalesced-passive-host" ref={host} />
}

// React parity: pending PASSIVE effects flush BEFORE the next render pass begins
// (React's flushPassiveEffects-at-render-start). The Presence/Tooltip shape:
//   commit #1 — `open` flips true; Gate renders but its child is NOT mounted yet
//     (the reveal waits on Gate's layout effect flipping local state, à la Radix
//     Presence). The parent queues a PASSIVE effect that dispatches a document
//     CustomEvent announcing the open.
//   commit #2 — triggered by Gate's layout effect. Before this render starts,
//     commit #1's passive effects must flush: the dispatch fires while the child
//     does not exist, so the child's own listener (attached in its passive
//     effect) must NOT observe the announcement of its own mount.
// Without the rule, both passives land in one drain and run child-first —
// the child hears its own open announcement (Radix Tooltip self-closed).
const OPEN_EVENT = 'octane-test-open';

function Listener(props) @{
	useEffect((log) => {
		log.push('attach');
		const onOpen = () => log.push('received');
		document.addEventListener(OPEN_EVENT, onOpen);
		return () => document.removeEventListener(OPEN_EVENT, onOpen);
	}, [props.log]);
	<span id="listener">{'on'}</span>
}

// Presence-style gate: renders children only after a layout effect flips state.
function Gate(props) {
	const [mounted, setMounted] = useState(false);
	useLayoutEffect(() => {
		setMounted(true);
	}, []);
	if (!mounted) return null;
	return <Listener log={props.log} />;
}

export function PassiveBeforeCascadeRender(props) @{
	const [open, setOpen] = useState(false);
	useEffect((log, isOpen) => {
		if (isOpen) {
			log.push('dispatch');
			document.dispatchEvent(new CustomEvent(OPEN_EVENT));
		}
	}, [props.log, open]);
	<div>
		<button id="open" onClick={() => setOpen(true)}>{'open'}</button>
		@if (open) {
			<Gate log={props.log} />
		}
	</div>
}

// Multiple useEffects within the SAME phase — used to verify that cleanups
// fire in REVERSE-mount order within a phase (React's per-fiber contract).
// Three useEffects A, B, C; their mount callbacks each log themselves, and
// their cleanups log "<name>:cleanup". On unmount React fires C:cleanup
// before B:cleanup before A:cleanup.
export function ManyPassiveEffects(props) @{
	useEffect((log) => {
		log.push('A:body');
		return () => log.push('A:cleanup');
	}, [props.log]);
	useEffect((log) => {
		log.push('B:body');
		return () => log.push('B:cleanup');
	}, [props.log]);
	useEffect((log) => {
		log.push('C:body');
		return () => log.push('C:cleanup');
	}, [props.log]);
	<span>{'multi'}</span>
}
