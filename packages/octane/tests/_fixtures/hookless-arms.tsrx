import { Activity, use, useEffect, useLayoutEffect, useRef, useState } from 'octane';

// Each scenario comes in two forms with identical output. In the `Plain` form
// every arm is hookless. In the `Hooked` form each arm also calls `useRef`,
// which gives it state of its own, so the comparison covers both kinds of arm.

type Log = (entry: string) => void;

function Probe(props: { name: string; log: Log }) @{
	useLayoutEffect(() => {
		props.log('layout ' + props.name);
		return () => props.log('layout cleanup ' + props.name);
	}, []);
	useEffect(() => {
		props.log('effect ' + props.name);
		return () => props.log('effect cleanup ' + props.name);
	}, []);
	<i class="probe">{props.name as string}</i>
}

function Resource(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<em>{value as string}</em>
}

type SwapProps = { on: boolean; log: Log; refLog: (el: Element | null) => void };

export function SwapPlain(props: SwapProps) @{
	<section>
		<Probe name="first" log={props.log} />
		@if (props.on) {
			<>
				<b ref={props.refLog}>{'on'}</b>
				<Probe name="on" log={props.log} />
			</>
		} @else {
			<Probe name="off" log={props.log} />
		}
		<Probe name="last" log={props.log} />
	</section>
}

export function SwapHooked(props: SwapProps) @{
	<section>
		<Probe name="first" log={props.log} />
		@if (props.on) {
			useRef(0);
			<>
				<b ref={props.refLog}>{'on'}</b>
				<Probe name="on" log={props.log} />
			</>
		} @else {
			useRef(0);
			<Probe name="off" log={props.log} />
		}
		<Probe name="last" log={props.log} />
	</section>
}

type SuspendProps = { which: 'a' | 'b'; promise: Promise<string>; log: Log };

export function SuspendPlain(props: SuspendProps) @{
	@try {
		@if (props.which === 'a') {
			<Probe name="a" log={props.log} />
		} @else {
			<>
				<Resource promise={props.promise} />
				<Probe name="b" log={props.log} />
			</>
		}
	} @pending {
		<p>{'loading'}</p>
	}
}

export function SuspendHooked(props: SuspendProps) @{
	@try {
		@if (props.which === 'a') {
			useRef(0);
			<Probe name="a" log={props.log} />
		} @else {
			useRef(0);
			<>
				<Resource promise={props.promise} />
				<Probe name="b" log={props.log} />
			</>
		}
	} @pending {
		<p>{'loading'}</p>
	}
}

type Row = { id: number; on: boolean };

export function RowsPlain(props: { items: Row[] }) @{
	<ul>
		@for (const item of props.items; key item.id) {
			@if (item.on) {
				<li class="on">{('#' + item.id) as string}</li>
			} @else {
				<li class="off">{('#' + item.id) as string}</li>
			}
		}
	</ul>
}

export function RowsHooked(props: { items: Row[] }) @{
	<ul>
		@for (const item of props.items; key item.id) {
			@if (item.on) {
				useRef(0);
				<li class="on">{('#' + item.id) as string}</li>
			} @else {
				useRef(0);
				<li class="off">{('#' + item.id) as string}</li>
			}
		}
	</ul>
}

type ActivityProps = { mode: 'visible' | 'hidden'; on: boolean; log: Log };

export function ActivityPlain(props: ActivityProps) @{
	<Activity mode={props.mode}>
		@if (props.on) {
			<Probe name="inside" log={props.log} />
		}
	</Activity>
}

export function ActivityHooked(props: ActivityProps) @{
	<Activity mode={props.mode}>
		@if (props.on) {
			useRef(0);
			<Probe name="inside" log={props.log} />
		}
	</Activity>
}

type RollbackProps = { on: boolean; promise: Promise<string> | null; log: Log };

export function RollbackPlain(props: RollbackProps) @{
	<div>
		@if (props.on) {
			<Probe name="on" log={props.log} />
		} @else {
			<Probe name="off" log={props.log} />
		}
		@if (props.promise !== null) {
			<Resource promise={props.promise} />
		}
	</div>
}

export function RollbackHooked(props: RollbackProps) @{
	<div>
		@if (props.on) {
			useRef(0);
			<Probe name="on" log={props.log} />
		} @else {
			useRef(0);
			<Probe name="off" log={props.log} />
		}
		@if (props.promise !== null) {
			useRef(0);
			<Resource promise={props.promise} />
		}
	</div>
}

// An arm nested in a hookless arm, whose teardown unmounts the whole root.
function Leaver(props: { log: Log; onGone: () => void }) @{
	useLayoutEffect(() => {
		props.log('layout leaver');
		return () => {
			props.log('layout cleanup leaver');
			props.onGone();
		};
	}, []);
	<u>{'leaver'}</u>
}

type NestedProps = { log: Log; onGone: () => void; expose: (set: (on: boolean) => void) => void };

export function NestedPlain(props: NestedProps) @{
	const [inner, setInner] = useState(true);
	props.expose(setInner);
	<div>
		@if (props.log !== null) {
			<>
				@if (inner) {
					<Leaver log={props.log} onGone={props.onGone} />
				} @else {
					<Probe name="replacement" log={props.log} />
				}
			</>
		}
	</div>
}

export function NestedHooked(props: NestedProps) @{
	const [inner, setInner] = useState(true);
	props.expose(setInner);
	<div>
		@if (props.log !== null) {
			useRef(0);
			<>
				@if (inner) {
					<Leaver log={props.log} onGone={props.onGone} />
				} @else {
					<Probe name="replacement" log={props.log} />
				}
			</>
		}
	</div>
}
