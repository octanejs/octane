import { createElement, createPortal } from 'octane';

// A compiled single-root component: returning `<Solo/>` from a plain function
// takes renderBlock's markerless componentSlotSlot return path — the OTHER
// return-slot kind, so flipping host ⇄ Solo exercises disposeReturnSlot on an
// ANCHORLESS childSlot.
function Solo(props) @{
	<p class="solo">
		{props.label as string}
	</p>
}

// Return-slot flipper. `mode === 'host'` returns a LONE PURE-HOST descriptor —
// the anchorless childSlot regime — and every other mode flips the slot into a
// different content kind (text / null / de-opt array / singleRoot component /
// host-with-component-children / portal), which must promote the slot to
// markers in place without losing its position between the <b> siblings.
function Flipper(props) {
	const mode = props.mode;
	if (mode === 'host') {
		return createElement('div', { id: 'host', ref: props.hostRef }, 'host');
	}
	if (mode === 'text') {
		return 'plain';
	}
	if (mode === 'null') {
		return null;
	}
	if (mode === 'array') {
		return [createElement('i', { key: 'a' }, 'a'), createElement('i', { key: 'b' }, 'b')];
	}
	if (mode === 'comp') {
		return <Solo label="solo" />;
	}
	if (mode === 'hostcomp') {
		return createElement('div', { id: 'hc' }, createElement(Solo, { label: 'deep' }));
	}
	if (mode === 'portal') {
		return createPortal(Solo, props.target, { label: 'portal' });
	}
	return null;
}

export function App(props) @{
	<section class="root">
		<b>{'A'}</b>
		<Flipper mode={props.mode} target={props.target} hostRef={props.hostRef} />
		<b>{'B'}</b>
	</section>
}
