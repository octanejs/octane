import { useState, useEffect } from 'octane';

let _renderCount = 0;
export function resetRenderCount() {
	_renderCount = 0;
}
export function getRenderCount() {
	return _renderCount;
}

// Render-phase update, guarded (React's getDerivedStateFromProps replacement):
// when a prop diverges from the mirrored state, setState DURING render and let
// the scheduler re-render before commit. Must converge with the derived value
// visible in the committed DOM and no effect firing for the intermediate state.
export function DerivedFromProp(props) @{
	const [prev, setPrev] = useState(props.value);
	const [derived, setDerived] = useState(props.value * 2);
	_renderCount++;
	if (props.value !== prev) {
		setPrev(props.value);
		setDerived(props.value * 2);
	}
	<span id="out">{derived as number}</span>
}

// Render-phase update chain that takes several passes to converge: state climbs
// toward the prop one step per render.
export function ConvergingClamp(props) @{
	const [n, setN] = useState(0);
	_renderCount++;
	if (n < props.target) {
		setN(n + 1);
	}
	<span id="out">{n as number}</span>
}

// Unguarded render-phase update — every render schedules another one. React
// throws "Too many re-renders"; octane must throw rather than hang.
export function UnguardedRenderLoop() @{
	const [n, setN] = useState(0);
	setN(n + 1);
	<span id="out">{n as number}</span>
}

export function CaughtRenderLoop() @{
	<>
		@try {
			<UnguardedRenderLoop />
		} @catch (err) {
			<span id="err">{err.message as string}</span>
		}
	</>
}

// The initial useState argument is only meaningful on mount — a changed prop
// must NOT re-seed the state on later renders.
export function InitialFromProp(props) @{
	const [n] = useState(props.seed);
	_renderCount++;
	<span id="out">{n as number}</span>
}

// Setting state to its current value must skip the render AND therefore any
// effect keyed on that state.
let _effectRuns = 0;
export function getEffectRuns() {
	return _effectRuns;
}
export function resetEffectRuns() {
	_effectRuns = 0;
}
export function SameValueEffectSkip() @{
	const [n, setN] = useState(0);
	useEffect(() => {
		_effectRuns++;
	}, [n]);
	<div>
		<button id="same" onClick={() => setN(0)}>{'same'}</button>
		<button id="bump" onClick={() => setN(n + 1)}>{'bump'}</button>
		<span id="out">{n as number}</span>
	</div>
}

// A bailed-out update must not poison the slot: NaN -> NaN bails, a later
// NaN -> 1 must still render.
export function BailThenChange() @{
	const [n, setN] = useState(NaN);
	_renderCount++;
	<div>
		<button id="nan" onClick={() => setN(NaN)}>{'nan'}</button>
		<button id="one" onClick={() => setN(1)}>{'one'}</button>
		<span id="out">
			{Number.isNaN(n) ? 'NaN' : n as number}
		</span>
	</div>
}

// Each queued functional updater must receive the PENDING value produced by the
// previous updater in the same batch, not the committed render value.
let _updaterArgs: number[] = [];
export function getUpdaterArgs() {
	return _updaterArgs;
}
export function resetUpdaterArgs() {
	_updaterArgs = [];
}
export function UpdaterSeesPending() @{
	const [n, setN] = useState(0);
	<div>
		<button
			id="chain"
			onClick={() => {
				setN((p: number) => {
					_updaterArgs.push(p);
					return p + 1;
				});
				setN((p: number) => {
					_updaterArgs.push(p);
					return p + 1;
				});
				setN((p: number) => {
					_updaterArgs.push(p);
					return p + 1;
				});
			}}
		>{'chain'}</button>
		<span id="out">{n as number}</span>
	</div>
}

// Set-then-revert inside one handler: the state ends where it began, but the
// first set already scheduled work, so the component body still runs once.
export function SetThenRevert() @{
	const [n, setN] = useState(0);
	_renderCount++;
	<div>
		<button
			id="revert"
			onClick={() => {
				setN(1);
				setN(0);
			}}
		>{'revert'}</button>
		<span id="out">{n as number}</span>
	</div>
}

// On a dep change, the outgoing cleanup must close over the PREVIOUS render's
// value while the incoming setup sees the fresh one.
export function CleanupClosure(props) @{
	const [n, setN] = useState(0);
	useEffect(() => {
		props.log('setup:' + n);
		return () => props.log('cleanup:' + n);
	}, [n]);
	<button id="inc" onClick={() => setN(n + 1)}>{n as number}</button>
}
