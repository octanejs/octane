import { createElement, useLayoutEffect, useState } from 'octane';

// A component that renders a <div> (mirrors Base UI's Fieldset.Legend, which renders a
// div via its render engine).
function Leaf(props) @{
	<div class="leaf">
		{props.label as string}
	</div>
}

// Mimics Base UI's FieldsetRoot: it receives its children as a runtime array via
// `props.children` and threads them into a fresh intrinsic element through
// `createElement` (value position), rather than as compiler-static child slots.
function Wrapper(props) {
	return createElement('fieldset', { class: 'fs', children: props.children });
}

// Probe C — the exact Fieldset path: children [component→div, element] arrive as a
// runtime array and are re-emitted via createElement into a fieldset.
export function ValuePositionMixed() @{
	<Wrapper>
		<Leaf label="A" />
		<input type="text" />
	</Wrapper>
}

// Probe A: an intrinsic parent whose children are [component→div, element]. No effects,
// no state — pure static ordering. Expected: <div class="leaf">…</div> then <input>.
export function MixedNoEffect() @{
	<fieldset class="fs">
		<Leaf label="A" />
		<input type="text" />
	</fieldset>
}

// A leaf that, on mount, calls a parent-provided setter from a layout effect — mirroring
// Fieldset.Legend's `setLegendId` effect that re-renders the grandparent Root.
function LeafWithEffect(props) @{
	useLayoutEffect(() => {
		props.onMount('legend-id');
	}, [props.onMount]);
	<div class="leaf">
		{props.label as string}
	</div>
}

// Probe B: the parent holds state; the component child's layout effect updates it,
// forcing a parent re-render. Children are [componentWithEffect→div, element]. This is
// the exact shape of Fieldset (Root state ← Legend effect, mixed legend/control kids).
export function MixedWithEffect() @{
	const [labelId, setLabelId] = useState(undefined);
	<fieldset class="fs" aria-labelledby={labelId as string}>
		<LeafWithEffect label="A" onMount={setLabelId} />
		<input type="text" />
	</fieldset>
}
