import { createContext, use, useCallback, useState } from 'octane';
import { projectValue, projectCount } from './automemo-format-helpers.ts';

// Fixtures for the boundary autoMemo draws around calls in a template.
//
// Every LIVE_* component below renders a list whose ARRAY IDENTITY never
// changes and whose item objects are never replaced — the only thing that moves
// is state hidden behind an accessor (the TanStack Table shape:
// `header.column.getIsSorted()` flips while `header` stays the memoized
// object). A region that memoized on the stable list identity would freeze that
// output, so each of these asserts the value still reaches the DOM after an
// unrelated parent re-render.
//
// The PROJECTION_* components are the converse: they render through calls that
// ARE admitted as value projections, and must stay reactive to their real
// inputs.

let LIVE = 'v0';
export function setLive(value: string) {
	LIVE = value;
}
export function resetLive() {
	LIVE = 'v0';
}

// Stable identities: neither the array nor the row objects are ever replaced,
// so nothing in a dependency tuple witnesses a LIVE change.
const liveRows = [
	{ id: 1, read: () => `r1:${LIVE}` },
	{ id: 2, read: () => `r2:${LIVE}` },
];

// --- callee shapes that must NOT be memoized through -----------------------

// A module helper that calls a method on its parameter: the receiver hazard
// moved one call frame away from `{row.read()}`.
function viaModuleHelper(row: { read: () => string }): string {
	return row.read();
}

// The same hazard two frames away, through another module helper.
function viaTransitiveHelper(row: { read: () => string }): string {
	return viaModuleHelper(row);
}

// A module `function` that is REASSIGNED later in the module: its identity is
// as mutable as a module `let`, so it is not an immutable witness.
function reassignedHelper(row: { read: () => string }): string {
	return `orig:${row.id}`;
}
// eslint-disable-next-line no-func-assign
reassignedHelper = (row: { read: () => string }) => row.read();

export function LiveViaModuleHelper() @{
	const [n, setN] = useState(0);
	<div>
		<button id="lmh-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lmh-row">{viaModuleHelper(row)}</li>
			}
		</ul>
	</div>
}

export function LiveViaTransitiveHelper() @{
	const [n, setN] = useState(0);
	<div>
		<button id="lth-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lth-row">{viaTransitiveHelper(row)}</li>
			}
		</ul>
	</div>
}

export function LiveViaLocalArrow() @{
	const [n, setN] = useState(0);
	const read = (row: { read: () => string }) => row.read();
	<div>
		<button id="lla-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lla-row">{read(row)}</li>
			}
		</ul>
	</div>
}

// A component-local callee handed a STABLE identity by useCallback — the shape
// that makes "local callees are unstable anyway" an unsafe assumption.
export function LiveViaStableLocal() @{
	const [n, setN] = useState(0);
	const read = useCallback((row: { read: () => string }) => row.read());
	<div>
		<button id="lsl-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lsl-row">{read(row)}</li>
			}
		</ul>
	</div>
}

export function LiveViaLocalFunction() @{
	const [n, setN] = useState(0);
	function read(row: { read: () => string }) {
		return row.read();
	}
	<div>
		<button id="llf-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="llf-row">{read(row)}</li>
			}
		</ul>
	</div>
}

export function LiveViaReassignedHelper() @{
	const [n, setN] = useState(0);
	<div>
		<button id="lrh-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lrh-row">{reassignedHelper(row)}</li>
			}
		</ul>
	</div>
}

// The callee is an admitted projection but an ARGUMENT executes the live
// accessor — arguments carry the render-value contract too.
export function LiveViaProjectedArgument() @{
	const [n, setN] = useState(0);
	<div>
		<button id="lpa-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lpa-row">{projectCount(row.read().length)}</li>
			}
		</ul>
	</div>
}

// A direct member call — the original contract, unchanged by this work.
export function LiveViaMemberCall() @{
	const [n, setN] = useState(0);
	<div>
		<button id="lmc-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of liveRows; key row.id) {
				<li class="lmc-row">{row.read()}</li>
			}
		</ul>
	</div>
}

// --- callee shapes that ARE memoized through, and must stay reactive -------

function projectRow(row: { id: number; value: number }): string {
	return `m${row.id}:${row.value}`;
}

function projectRowTransitive(row: { id: number; value: number }): string {
	return projectRow(row);
}

export function ProjectionModuleHelper() @{
	const [rows, setRows] = useState([
		{ id: 1, value: 0 },
		{ id: 2, value: 0 },
	]);
	const [n, setN] = useState(0);
	<div>
		<button id="pmh-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<button
			id="pmh-bump"
			onClick={() => setRows(rows.map((r) => (r.id === 1 ? { ...r, value: r.value + 1 } : r)))}
		>{'bump'}</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li class="pmh-row">{projectRow(row)}</li>
			}
		</ul>
	</div>
}

export function ProjectionTransitive() @{
	const [rows, setRows] = useState([
		{ id: 1, value: 0 },
		{ id: 2, value: 0 },
	]);
	const [n, setN] = useState(0);
	<div>
		<button id="pt-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<button
			id="pt-bump"
			onClick={() => setRows(rows.map((r) => (r.id === 1 ? { ...r, value: r.value + 1 } : r)))}
		>{'bump'}</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li class="pt-row">{projectRowTransitive(row)}</li>
			}
		</ul>
	</div>
}

export function ProjectionImported() @{
	const [rows, setRows] = useState([
		{ id: 1, value: 0 },
		{ id: 2, value: 0 },
	]);
	const [n, setN] = useState(0);
	<div>
		<button id="pi-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<button
			id="pi-bump"
			onClick={() => setRows(rows.map((r) => (r.id === 1 ? { ...r, value: r.value + 1 } : r)))}
		>{'bump'}</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li class="pi-row">{projectValue(row)}</li>
			}
		</ul>
	</div>
}

// --- hook-shaped callees are never value projections ----------------------

// A custom hook called inside the region. Each row owns its own hook cell, so
// every row's setter is collected — bumping all of them proves the region did
// not skip the hook call for any of them.
const labelSetters: Array<(v: string) => void> = [];
export function bumpLabels() {
	for (const set of labelSetters) set('b');
}
export function resetLabelSetters() {
	labelSetters.length = 0;
}

function useLabel(seed: number): string {
	const [suffix, setSuffix] = useState('a');
	if (!labelSetters.includes(setSuffix)) labelSetters.push(setSuffix);
	return `${seed}${suffix}`;
}

export function HookInRegion() @{
	const [rows] = useState([{ id: 1 }, { id: 2 }]);
	const [n, setN] = useState(0);
	<div>
		<button id="hir-go" onClick={() => setN(n + 1)}>{'go'}</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li class="hir-row">{useLabel(row.id)}</li>
			}
		</ul>
	</div>
}

// A context consumer reached through a memoizable region. The consumer is an
// ordinary module `function` declaration — the shape that must be classified by
// its own component eligibility, never rescued as a plain module helper.
const LabelCtx = createContext('c0');

function CtxLeaf() @{
	const value = use(LabelCtx);
	<span class="ctx-leaf">{value as string}</span>
}

export function CtxUnderRegion() @{
	const [rows] = useState([{ id: 1 }, { id: 2 }]);
	const [value, setValue] = useState('c0');
	<div>
		<button id="cur-bump" onClick={() => setValue('c1')}>{'bump'}</button>
		<LabelCtx.Provider value={value}>
			<ul>
				@for (const row of rows; key row.id) {
					<li class="cur-row">
						<CtxLeaf />
					</li>
				}
			</ul>
		</LabelCtx.Provider>
	</div>
}

// --- component call sites under a module-helper-using parent ---------------

// Admitting module helpers as witnesses also unblocks the CALL-SITE memo for
// child components rendered by a parent that formats through one. The child
// must still re-render whenever the props it is given actually change, and must
// not be re-rendered into staleness when they do not.
function labelFor(n: number): string {
	return `L${n}`;
}

function CallSiteChild(props) @{
	<span class="csc-child">{props.label as string}</span>
}

export function CallSiteParent() @{
	const [count, setCount] = useState(0);
	const [tick, setTick] = useState(0);
	<div>
		<button id="csp-tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<button id="csp-count" onClick={() => setCount(count + 1)}>{'count'}</button>
		<span class="csc-heading">{labelFor(tick)}</span>
		<CallSiteChild label={labelFor(count)} />
	</div>
}
