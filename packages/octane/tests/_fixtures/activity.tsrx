import { Activity, useState, useEffect, useLayoutEffect, useInsertionEffect } from 'octane';

// Child logs render + effect mount/unmount, exposes its setState so the test can
// bump state, and renders its count so state preservation is observable.
function Child(props) @{
	const [n, setN] = useState(0);
	props.expose(setN);
	useLayoutEffect(() => {
		props.log('mount layout');
		return () => props.log('unmount layout');
	}, []);
	useEffect(() => {
		props.log('mount passive');
		return () => props.log('unmount passive');
	}, []);
	props.log('render');
	<span id="child">{n as number}</span>
}

export function ActivityHost(props) @{
	<div id="host">
		<Activity mode={props.mode}>
			<Child log={props.log} expose={props.expose} />
		</Activity>
	</div>
}

// Insertion + layout effects side by side, with bumpable state so the test can
// UPDATE the child while hidden. React keeps insertion effects CONNECTED across
// visibility changes (they own injected styles): hide runs no insertion cleanup,
// reveal doesn't re-fire them, and a deps-changed update while hidden still
// cycles them (the subtree is pre-rendered) — Activity-test.js:1428.
function InsertionChild(props) @{
	const [n, setN] = useState(0);
	props.expose(setN);
	useInsertionEffect(() => {
		props.log('insertion mount ' + n);
		return () => props.log('insertion cleanup ' + n);
	}, [n]);
	useLayoutEffect(() => {
		props.log('layout mount');
		return () => props.log('layout cleanup');
	}, []);
	<span id="ichild">{n as number}</span>
}

export function InsertionActivityHost(props) @{
	<div id="host">
		<Activity mode={props.mode}>
			<InsertionChild log={props.log} expose={props.expose} />
		</Activity>
	</div>
}

// Bare-text Activity child: when hidden, the direct text node (no element box,
// can't take display:none) must still be hidden — see hideActivityRange.
export function TextActivityHost(props) @{
	<div id="host">
		<Activity mode={props.mode}>{props.text as string}</Activity>
	</div>
}

// Nested: an inner Activity (mode controlled separately) inside an outer one.
function Inner(props) @{
	useLayoutEffect(() => {
		props.log('mount inner');
		return () => props.log('unmount inner');
	}, []);
	props.log('render inner');
	<span id="inner">{'inner'}</span>
}

export function NestedActivity(props) @{
	<div id="host">
		<Activity mode={props.outer}>
			<Activity mode={props.inner}>
				<Inner log={props.log} />
			</Activity>
		</Activity>
	</div>
}

// Labeled passive-effect child for the nested-reveal conformance test.
function Labeled(props) @{
	useEffect(() => {
		props.log('Mount ' + props.label);
		return () => props.log('Unmount ' + props.label);
	}, []);
	<span class="labeled">{props.label as string}</span>
}

// Outer Activity wrapping a child + an independently-controlled inner Activity.
// Revealing the outer must NOT mount the still-hidden inner's effects.
export function NestedRevealActivity(props) @{
	<div id="host">
		<Activity mode={props.outer}>
			<div>
				<Labeled label="Outer" log={props.log} />
				<Activity mode={props.inner}>
					<div>
						<Labeled label="Inner" log={props.log} />
					</div>
				</Activity>
			</div>
		</Activity>
	</div>
}

// Nested parent/child each with a passive effect — for asserting hide cleanup order.
function OrderChild(props) @{
	useEffect(() => {
		props.log('mount child');
		return () => props.log('unmount child');
	}, []);
	<span class="oc">{'c'}</span>
}
function OrderParent(props) @{
	useEffect(() => {
		props.log('mount parent');
		return () => props.log('unmount parent');
	}, []);
	<OrderChild log={props.log} />
}
export function OrderActivity(props) @{
	<div id="host">
		<Activity mode={props.mode}>
			<OrderParent log={props.log} />
		</Activity>
	</div>
}
