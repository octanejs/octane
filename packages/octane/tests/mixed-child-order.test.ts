import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers.js';
import {
	MixedNoEffect,
	MixedWithEffect,
	ValuePositionMixed,
} from './_fixtures/mixed-child-order.tsrx';

// octane uses structural anchor comments (a `<!>` placeholder marks a component root's
// source-order position among static siblings) that React has no equivalent for — the
// differential rig strips comments for exactly this reason. These tests pin SOURCE ORDER
// of the real element/text nodes, which is what regressed: a component child that
// precedes a host sibling must render FIRST.
function stripComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

describe('mixed component/element sibling ordering under an intrinsic parent', () => {
	it('static: [component→div, element] renders in source order', () => {
		const m = mount(MixedNoEffect);
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<fieldset class="fs"><div class="leaf">A</div><input type="text"></fieldset>',
		);
		m.unmount();
	});

	it('value position: [component→div, element] via a compiled children fragment keeps source order', () => {
		// Regression: the `.tsrx` fragment-body codegen dropped the component root's
		// `<!>` anchor and appended it at `endMarker`, so the static `<input>` drained
		// first and the component landed AFTER it — reversing source order. This is the
		// exact shape Base UI's Fieldset (children threaded through createElement) hits.
		const m = mount(ValuePositionMixed);
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<fieldset class="fs"><div class="leaf">A</div><input type="text"></fieldset>',
		);
		m.unmount();
	});

	it('effect-driven re-render: order is preserved after a child effect updates parent state', () => {
		const m = mount(MixedWithEffect);
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<fieldset class="fs" aria-labelledby="legend-id"><div class="leaf">A</div><input type="text"></fieldset>',
		);
		m.unmount();
	});
});
