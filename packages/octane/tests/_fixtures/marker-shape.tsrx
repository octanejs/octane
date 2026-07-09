import { useState, createElement } from 'octane';

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
