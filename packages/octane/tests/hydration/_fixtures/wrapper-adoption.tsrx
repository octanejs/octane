import { Suspense, useState } from 'octane';

// Nested return-JSX wrappers exercise hydration adoption through component
// layers without exposing the framework's ownership representation.
function InteractiveLeaf(props: { label: string; className: string }) {
	const [count, setCount] = useState(0);
	return <button class={props.className} onClick={() => setCount(count + 1)}>
		{props.label + ':' + count}
	</button>;
}

function InteractiveMiddle(props: { label: string; className: string }) {
	return <InteractiveLeaf label={props.label} className={props.className} />;
}

function InteractiveOuter(props: { label: string; className: string }) {
	return <InteractiveMiddle label={props.label} className={props.className} />;
}

// A fragment-style pass-through adds another component layer around children.
function PassThrough(props: { children?: unknown }) @{
	<>
		{props.children}
	</>
}

export function WrapperChain() @{
	<section class="wrapper-chain">
		<PassThrough>
			<InteractiveOuter label="wrapped" className="wrapper-button" />
		</PassThrough>
	</section>
}

function KeyedReturnMiddle(props: { itemKey?: string }) {
	return <InteractiveLeaf key={props.itemKey} label="keyed" className="keyed-return-button" />;
}

export function KeyedReturnWrapper(props: { itemKey?: string }) {
	return <KeyedReturnMiddle itemKey={props.itemKey} />;
}

function BranchLeaf(props: { count: number; onClick: () => void }) {
	return <button class="branch-button" onClick={props.onClick}>{'branch:' + props.count}</button>;
}

function BranchMiddle(props: { count: number; onClick: () => void }) {
	return <BranchLeaf count={props.count} onClick={props.onClick} />;
}

export function SwappingBranch(props: { active: boolean }) @{
	const [count, setCount] = useState(0);
	<section class="swapping-branch">
		@if (props.active) {
			<BranchMiddle count={count} onClick={() => setCount(count + 1)} />
		} @else {
			<p class="branch-off">off</p>
		}
	</section>
}

type Row = { id: string };

function StatefulRow(props: { row: Row }) {
	const [count, setCount] = useState(0);
	return <li class="coalesced-row" data-id={props.row.id}>
		<button class="row-button" onClick={() => setCount(count + 1)}>
			{props.row.id + ':' + count}
		</button>
	</li>;
}

function RowWrapper(props: { row: Row }) {
	return <StatefulRow row={props.row} />;
}

export function KeyedWrapperList(props: { rows: Row[] }) @{
	<ul class="coalesced-list">
		@for (const row of props.rows; key row.id) {
			<RowWrapper row={row} />
		}
	</ul>
}

// The compiler cannot recognize this local alias as a built-in boundary. The
// shared runtime capability must still preserve its load-bearing SSR range.
const Boundary = Suspense;

function AliasedSuspenseBoundary(props: { children?: unknown }) @{
	<Boundary fallback={<i class="pending">pending</i>}>{props.children}</Boundary>
}

export function SuspenseWrapperChain() @{
	<section class="suspense-wrapper-chain">
		<AliasedSuspenseBoundary>
			<PassThrough>
				<InteractiveOuter label="ready" className="suspense-button" />
			</PassThrough>
		</AliasedSuspenseBoundary>
	</section>
}

// Return Suspense as a component value rather than placing it directly in the
// parent's template.
function ReturnedSuspenseValue() {
	return <Suspense fallback={<i class="returned-pending">pending</i>}>
		<PassThrough>
			<InteractiveOuter label="returned" className="returned-suspense-button" />
		</PassThrough>
	</Suspense>;
}

export function ReturnedSuspenseChildSlot() @{
	<section class="returned-suspense-child-slot">
		<ReturnedSuspenseValue />
	</section>
}
