import {
	useState,
	useEffect,
	createElement,
	createContext,
	useContext,
	Suspense,
	startTransition,
} from 'octane';
import { ExtLeaf } from './marker-shape-ext.tsrx';

// Marker-shape corpus (M0 of docs/comment-marker-elision-plan.md): one
// representative per marker-minting regime, so marker-shape.test.ts can pin
// EXACT comment counts across client mount / SSR string / hydration. Elision
// phases must edit those pins deliberately.

// (a) Sole-child wrapper chain — each layer has a hook so it is NOT lite and
// NOT singleRoot-by-element (its root is a component), i.e. today each layer
// costs one marker pair. The M3 inherited-range target.
function Leaf() @{
	const [n] = useState(0);
	<div class="leaf">
		{'n:' + n}
	</div>
}
function Mid() @{
	const [x] = useState(1);
	<Leaf data-x={x} />
}
export function Chain() @{
	const [y] = useState(2);
	<Mid data-y={y} />
}

// (a2) CROSS-MODULE sole child — ExtLeaf lives in marker-shape-ext.tsrx; the
// call site emits the `2` sentinel and the runtime elides iff the callee's
// definition-site $$singleRoot stamp is present (M1). Since M3 the site is
// ALSO inherit-stamped (a call-site property — module-independent), which
// supersedes the sentinel.
export function ChainX() @{
	const [z] = useState(3);
	<ExtLeaf data-z={z} />
}

// (a3) KEYED sole child — `key=` is excluded from M3 inherit (key-driven
// identity forces the slot to own its range), so this site keeps its pair on
// all three sides while the layer BELOW it (Mid → Leaf) still inherits.
export function ChainKeyed(props: { k: string }) @{
	const [w] = useState(4);
	<Mid key={props.k} data-w={w} />
}

// (a4) Sole-root identity SWAP — the tag is a per-render LOCAL, so the same
// inherit-stamped site alternates component identity across renders. This
// exercises the borrowed-range teardown (sweep BETWEEN the parent's markers,
// never remove them) + in-place remount, the riskiest M3 runtime path.
// (M1's singleRoot sentinel must NOT fire here — local callee — but inherit
// legitimately does: the slot owns the range regardless of identity.)
function SwapA() @{
	const [a] = useState('A');
	<ins class="sa">
		{'v:' + a}
	</ins>
}
function SwapB() @{
	const [b] = useState('B');
	<>
		<del class="sb">
			{'v:' + b}
		</del>
		<del class="sb2">tail</del>
	</>
}
export function SwapInherit(props: { useA: boolean }) @{
	const Comp = props.useA ? SwapA : SwapB;
	<Comp />
}

// (a4b) The same swap site nested under an element, so SwapInherit's own slot
// mints a real `comp`/`/comp` pair — its INNER `<Comp/>` site then borrows
// that pair (the borrowed-COMMENT-pair regime, vs (a4)'s whole-container
// regime at the root). The pair must survive every swap.
export function WrapSwap(props: { useA: boolean }) @{
	<section class="ws">
		<SwapInherit useA={props.useA} />
	</section>
}

// (a8) MEMBER-TAG sole root — `<Ctx.Provider>` is the router/binding wrapper
// stack's shape (tanstack-router nests one context provider per route level).
// Member tags inherit too; boundary builtins are declined at RUNTIME by
// identity instead of by tag name.
const Theme = createContext('d');
function ThemedLeaf() @{
	const v = useContext(Theme);
	<b class="tl">
		{'t:' + v}
	</b>
}
export function Provided() @{
	const [p] = useState(0);
	<Theme.Provider value={'v' + p}>
		<ThemedLeaf />
	</Theme.Provider>
}

// (a9) ALIASED boundary builtin — the compile-time name exclusion can't see
// through `const S = Suspense`, so the site IS inherit-stamped; the runtime
// identity decline (componentSlot + ssrComponent, same identities) must keep
// the frame pair on BOTH sides or hydration desyncs.
const S = Suspense;
export function AliasSusp() @{
	const [q] = useState(5);
	<S fallback="…">
		<Leaf data-q={q} />
	</S>
}

// (b) Keyed @for with a SINGLE-root item body (client-mount item markers are
// elided via forBlock singleRoot) and an @empty branch.
export function ListSingle(props: { items: string[] }) @{
	<ul class="ls">
		@for (const it of props.items; key it) {
			<li>{it}</li>
		} @empty {
			<li class="none">none</li>
		}
	</ul>
}

// (c) Keyed @for with a MULTI-root item body — items keep their marker pairs
// on the client too.
export function ListMulti(props: { items: string[] }) @{
	<ul class="lm">
		@for (const it of props.items; key it) {
			<>
				<li>{it}</li>
				<li class="b">
					{it + '!'}
				</li>
			</>
		}
	</ul>
}

// (c2) A keyed list whose item body is a sole component call. SingleItem's
// definition proves one host root, so the item block and component slot share
// that <li> boundary. MultiItem is the conservative negative control.
function SingleItem(props: {
	value: string;
	onEffect?: (entry: string) => void;
	onRef?: (value: string, node: HTMLLIElement | null) => void;
}) @{
	const [n, setN] = useState(0);
	useEffect(() => {
		props.onEffect?.('mount:' + props.value);
		return () => props.onEffect?.('cleanup:' + props.value);
	}, []);
	<li
		class="component-item"
		data-value={props.value}
		ref={(node) => props.onRef?.(props.value, node)}
	>
		<button class="increment" onClick={() => setN(n + 1)}>
			{props.value + ':' + n}
		</button>
	</li>
}
function MultiItem(props: { value: string }) @{
	<>
		<li class="component-a">{props.value}</li>
		<li class="component-b">
			{props.value + '!'}
		</li>
	</>
}
export function ListComponent(props: {
	items: string[];
	onEffect?: (entry: string) => void;
	onRef?: (value: string, node: HTMLLIElement | null) => void;
}) @{
	<ul class="lc">
		@for (const it of props.items; key it) {
			<SingleItem value={it} onEffect={props.onEffect} onRef={props.onRef} />
		}
	</ul>
}
export function ListComponentMulti(props: { items: string[] }) @{
	<ul class="lcm">
		@for (const it of props.items; key it) {
			<MultiItem value={it} />
		}
	</ul>
}

export function ListConditional(props: { items: Array<{ id: string; code: boolean }> }) @{
	<div class="conditional-list">
		@for (const it of props.items; key it.id) {
			@if (it.code) {
				<pre class="conditional-item" data-id={it.id}>
					{'code:' + it.id}
				</pre>
			} @else {
				<p class="conditional-item" data-id={it.id}>
					{'text:' + it.id}
				</p>
			}
		}
	</div>
}

// Missing @else means the item can be empty, so it cannot use an element as a
// permanent keyed boundary.
export function ListConditionalEmpty(props: { items: Array<{ id: string; show: boolean }> }) @{
	<div class="conditional-empty-list">
		@for (const it of props.items; key it.id) {
			@if (it.show) {
				<span class="maybe-item" data-id={it.id}>{it.id}</span>
			}
		}
	</div>
}

export function TransitionConditionalList() @{
	const [code, setCode] = useState(false);
	<div class="transition-conditional">
		<button class="transition-flip" onClick={() => startTransition(() => setCode(!code))}>
			flip
		</button>
		<div class="transition-items">
			@for (const id of ['x']; key id) {
				@if (code) {
					<pre class="transition-item">code</pre>
				} @else {
					<p class="transition-item">text</p>
				}
			}
		</div>
	</div>
}

// (d) @if/@else with a single-element branch (self-marks on the client).
export function Branch(props: { on: boolean }) @{
	<div class="br">
		@if (props.on) {
			<p class="yes">yes</p>
		} @else {
			<p class="no">no</p>
		}
	</div>
}

// (d2) No @else: an inactive client branch keeps only the compiler's existing
// insertion anchor, then self-marks its host while active and returns to that
// one-anchor representation when inactive again.
export function BranchEmpty(props: { on: boolean; hit?: () => void }) @{
	<div class="be">
		<i class="before">before</i>
		@if (props.on) {
			<button class="active" onClick={props.hit}>active</button>
		}
		<i class="after">after</i>
	</div>
}

// Nested sole-root branches share the same element boundary. Replacing the
// inner arm must update the outer block's borrowed boundary too.
export function NestedBranch(props: { outer: boolean; inner: boolean }) @{
	<section class="nb">
		@if (props.outer) {
			@if (props.inner) {
				<strong class="inner-a">A</strong>
			} @else {
				<em class="inner-b">B</em>
			}
		}
		<span class="tail">tail</span>
	</section>
}

// (e) De-opt descriptor tree — a value-position createElement host whose
// subtree contains a component descriptor (the @octanejs/recharts shape):
// hostElementBody + nested childSlot pairs. The M2 target.
function DeepLeaf(props: { label: string }) @{
	<span class="dl">{props.label}</span>
}
export function Deopt() @{
	const tree = createElement(
		'div',
		{ class: 'deopt' },
		createElement('section', { class: 's0' }, createElement(DeepLeaf, { label: 'a' })),
		createElement('section', { class: 's1' }, 'plain'),
	);
	<div class="host">{tree}</div>
}
