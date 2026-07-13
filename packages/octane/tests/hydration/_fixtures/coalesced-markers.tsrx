import { Suspense, useState } from 'octane';

// Plain return-JSX wrappers intentionally do not receive the compiler's M3
// sole-`@{}` inheritance stamp. SSR therefore emits one logical component
// range per layer. Those ranges are exactly coextensive and are the canonical
// hydration-time coalescing case.
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

// SafeFragment-style template pass-through. Its binding bag contains a sole
// renderable-hole slot, so the compiler supplies the additional proof needed
// for that slot to join an exactly coextensive hydrated range group.
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
	return <button class="branch-button" onClick={props.onClick}>
		{'branch:' + props.count}
	</button>;
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

export function SuspenseWrapperChain() @{
	<section class="suspense-wrapper-chain">
		<Suspense fallback={<i class="pending">pending</i>}>
			<PassThrough>
				<InteractiveOuter label="ready" className="suspense-button" />
			</PassThrough>
		</Suspense>
	</section>
}

// A plain return-based component hands this Suspense descriptor back to
// renderBlock, whose return slot routes it through childSlot. Keeping the
// builtin out of the component's direct template is important to this case.
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
