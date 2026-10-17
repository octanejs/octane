import {
	Activity,
	ErrorBoundary,
	createPortal,
	startTransition,
	use,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';

// One app that removes content through every structural slot kind: a branch
// arm, a keyed component, keyed rows, a value hole, and a branch arm inside a
// resolved Suspense primary. Each removed leaf reports, from its layout-effect
// cleanup, whether its host was still connected.

export type CleanupReport = (id: string, connected: boolean) => void;

export interface StructureProps {
	show: boolean;
	version: number;
	rows: string[];
	child: boolean;
	gate?: PromiseLike<unknown>;
	onCleanup: CleanupReport;
}

function Leaf(props: { id: string; onCleanup: CleanupReport }) @{
	const ref = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		const node = ref.current!;
		return () => props.onCleanup(props.id, node.isConnected);
	});
	<b id={props.id} ref={ref}>
		{props.id}
	</b>
}

function Gate(props: { gate: PromiseLike<unknown> }) @{
	use(props.gate);
	<u>{'gate'}</u>
}

export function StructureApp(props: StructureProps) @{
	<main>
		@if (props.show) {
			<Leaf id="arm" onCleanup={props.onCleanup} />
		} @else {
			<i>{'else'}</i>
		}
		<Leaf key={props.version} id={'keyed-' + props.version} onCleanup={props.onCleanup} />
		@for (const row of props.rows; key row) {
			<Leaf id={'row-' + row} onCleanup={props.onCleanup} />
		}
		{props.child ? <Leaf id="child" onCleanup={props.onCleanup} /> : 'no child'}
		@try {
			<>
				@if (props.show) {
					const id = useRef('held-arm').current;
					<Leaf id={id} onCleanup={props.onCleanup} />
				} @else {
					<i>{'held else'}</i>
				}
				<s>{'held sibling'}</s>
			</>
		} @pending {
			<p>{'pending'}</p>
		}
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

// A later sibling observes the DOM while the swap above it is still rendering.
function Shown() @{
	<em class="value">{'shown value'}</em>
}

function Hidden() @{
	<>
		<em class="value">{'hidden value'}</em>
		<small>{'second value root'}</small>
	</>
}

function Keyed(props: { label: string }) @{
	<q>{props.label}</q>
}

export function BranchProbeApp(props: { show: boolean; probe: () => void }) @{
	<main>
		@if (props.show) {
			<b id="shown">{'shown'}</b>
		} @else {
			<>
				<i id="hidden">{'hidden'}</i>
				<s>{'second root'}</s>
			</>
		}
		<Keyed key={props.show ? 'shown' : 'hidden'} label="keyed" />
		{props.show ? <Shown /> : <Hidden />}
		<Probe probe={props.probe} />
	</main>
}

function Row(props: { id: string; onCleanup: CleanupReport }) @{
	const ref = useRef<HTMLLIElement | null>(null);
	useLayoutEffect(() => {
		const node = ref.current!;
		return () => props.onCleanup(props.id, node.isConnected);
	});
	<li id={props.id} ref={ref}>
		{props.id}
	</li>
}

export interface ListProps {
	rows: string[];
	gate?: PromiseLike<unknown>;
	probe: () => void;
	onCleanup: CleanupReport;
}

// Two keyed lists: rows bounded by a pair (a component root), with an @empty
// arm, and self-marked host rows between static siblings. The probe renders
// after both lists reconcile.
export function ListProbeApp(props: ListProps) @{
	<main>
		<ul id="paired">
			@for (const row of props.rows; key row) {
				<Row id={'row-' + row} onCleanup={props.onCleanup} />
			} @empty {
				<li id="empty">{'empty'}</li>
			}
		</ul>
		<ol id="plain">
			<li>{'first'}</li>
			@for (const row of props.rows; key row) {
				<li class="plain">{row as string}</li>
			}
			<li>{'last'}</li>
		</ol>
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

export interface OutsideProps {
	show: boolean;
	label: string;
	target: HTMLElement;
	gate?: PromiseLike<unknown>;
	probe: () => void;
}

// Content that lands outside the root's container: a hoisted head element
// and a portal, both mounted by a branch arm.
export function OutsideApp(props: OutsideProps) @{
	<main>
		@if (props.show) {
			<>
				<title>{props.label}</title>
				<div>{createPortal(<b class="portal-out">{props.label}</b>, props.target)}</div>
			</>
		}
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

export interface ActivityProps {
	mode: 'visible' | 'hidden';
	label: string;
	gate?: PromiseLike<unknown>;
	log: (entry: string) => void;
}

function ActivityLeaf(props: { label: string; log: (entry: string) => void }) @{
	useLayoutEffect(() => {
		props.log('mount');
		return () => props.log('unmount');
	}, []);
	<span id="activity-leaf">{props.label}</span>
}

// An Activity whose visibility a render can change while a sibling suspends.
export function ActivityApp(props: ActivityProps) @{
	<main>
		<Activity mode={props.mode}>
			<ActivityLeaf label={props.label} log={props.log} />
		</Activity>
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

function Reader(props: { value: PromiseLike<string> }) @{
	const value = use(props.value);
	<b id="resume-value">{value}</b>
}

// A boundary whose primary resumes when its promise settles; the probe
// renders after the reader, inside the same primary.
export function ResumeApp(props: { value: PromiseLike<string>; probe: () => void }) @{
	<main>
		@try {
			<>
				<s id="resume-static">{'static'}</s>
				<Reader value={props.value} />
				<Probe probe={props.probe} />
			</>
		} @pending {
			<p id="resume-pending">{'pending'}</p>
		}
	</main>
}

function Fails(props: { fail: boolean; id: string }) @{
	if (props.fail) throw new Error('fails');
	<b id={props.id}>{props.id}</b>
}

function Value(props: { value: PromiseLike<string> }) @{
	const value = use(props.value);
	<s>{value}</s>
}

export interface BoundaryArmsProps {
	fail: boolean;
	shown: PromiseLike<string>;
	waiting: PromiseLike<string>;
	hold?: PromiseLike<unknown>;
	gate?: PromiseLike<unknown>;
}

// Boundaries whose arms a render replaces: a @try and an ErrorBoundary that
// catch, a resolved @try whose primary suspends, and a @try whose first
// primary is still pending. They sit in a resolved boundary that holds a
// transition when `hold` suspends, before a sibling outside every boundary
// that suspends on `gate`.
export function BoundaryArmsApp(props: BoundaryArmsProps) @{
	<main>
		@try {
			<>
				@try {
					<Fails fail={props.fail} id="try-ok" />
				} @catch (error) {
					<i>{'try caught'}</i>
				}
				<ErrorBoundary fallback={<i>{'boundary caught'}</i>}>
					<Fails fail={props.fail} id="boundary-ok" />
				</ErrorBoundary>
				@try {
					<Value value={props.shown} />
				} @pending {
					<p>{'shown pending'}</p>
				}
				@try {
					<Value value={props.waiting} />
				} @pending {
					<p>{'waiting'}</p>
				}
				@if (props.hold) {
					<Gate gate={props.hold} />
				}
			</>
		} @pending {
			<p>{'held pending'}</p>
		}
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

export interface SelectProps {
	rows: string[];
	values: string[];
	gate?: PromiseLike<unknown>;
	probe: () => void;
}

// A controlled multi-select whose options a keyed list renders.
export function SelectProbeApp(props: SelectProps) @{
	<main>
		<select multiple value={props.values} onChange={() => {}}>
			@for (const row of props.rows; key row) {
				<option value={row}>{row as string}</option>
			}
		</select>
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Gate gate={props.gate} />
		}
	</main>
}

function LateBoundary(props: { value: PromiseLike<string>; probe: () => void }) @{
	const value = use(props.value);
	<>
		<ErrorBoundary fallback={<i>{'late caught'}</i>}>
			<b id="late-value">{value}</b>
		</ErrorBoundary>
		<Probe probe={props.probe} />
	</>
}

// A component whose first render suspended before its error boundary: when it
// resumes, the boundary is new under DOM its earlier render committed.
export function LateBoundaryApp(props: { value: PromiseLike<string>; probe: () => void }) @{
	<main>
		@try {
			<LateBoundary value={props.value} probe={props.probe} />
		} @pending {
			<p id="late-pending">{'pending'}</p>
		}
	</main>
}

export interface MappedRow {
	id: number;
}

export interface MappedProps {
	rows: { map<T>(callback: (row: MappedRow, index: number) => T): T[] };
	probe: () => void;
}

function MappedChip(props: { id: number }) @{
	<li id={'mapped-' + props.id}>{('chip ' + props.id) as string}</li>
}

// Rows through an exotic `map`, which can return a host descriptor for a row
// that the next render maps to a component.
export function MappedApp(props: MappedProps) @{
	<main>
		<ul id="mapped">
			{props.rows.map((row) => (
				<MappedChip key={row.id} id={row.id} />
			))}
		</ul>
		<Probe probe={props.probe} />
	</main>
}

export interface ArmSwapControls {
	move(): void;
	setLocal(local: number): void;
}

function ArmSwapOwner(props: {
	start: boolean;
	step: number;
	controls: ArmSwapControls;
	probe: () => void;
}) @{
	const [local, setLocal] = useState(0);
	props.controls.setLocal = setLocal;
	const flipped = props.step === 1 && local === 0;
	const on = props.start ? !flipped : flipped;
	<ArmSwapBody depth={3} on={on} probe={props.probe} />
}

// Stateless nesting keeps the stateful owner's commit boundary, even when
// several component and branch scopes stand between it and the swapped arm.
function ArmSwapBody(props: { depth: number; on: boolean; probe: () => void }) @{
	@if (props.depth > 0) {
		<ArmSwapBody depth={props.depth - 1} on={props.on} probe={props.probe} />
	} @else {
		<div id="arm-swap">
			@if (props.on) {
				<b class="lone">{'lone'}</b>
			}
			<i>{'tail'}</i>
			<Probe probe={props.probe} />
		</div>
	}
}

// One drain swaps the arm twice: the parent's urgent update flips it, and the
// owner's transition after it flips it back, so the second swap replaces an
// arm the same render swapped in.
export function ArmSwapApp(props: {
	start: boolean;
	controls: ArmSwapControls;
	probe: () => void;
}) @{
	const [step, setStep] = useState(0);
	props.controls.move = () => {
		setStep(1);
		startTransition(() => props.controls.setLocal(1));
	};
	<ArmSwapOwner start={props.start} step={step} controls={props.controls} probe={props.probe} />
}

function RetireRow(props: {
	id: number;
	log: string[];
	expose: (set: (n: number) => void) => void;
}) @{
	const [n, setN] = useState(0);
	props.expose(setN);
	props.log.push('row ' + props.id + ':' + n);
	<li>{String(n) as string}</li>
}

// Rows with state, so a row's own update can be queued in the drain whose
// root render deletes it.
export function RetireList(props: {
	ids: number[];
	log: string[];
	expose: (set: (n: number) => void) => void;
}) @{
	<ul id="retire">
		@for (const id of props.ids; key id) {
			<RetireRow id={id} log={props.log} expose={props.expose} />
		}
	</ul>
}
