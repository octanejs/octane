import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { EffectDispatch, LabelFor, InvalidEvents } from './_fixtures/effect-dispatch.tsrx';

describe('effect dispatching a discrete event (drainPhase re-entrancy)', () => {
	it('runs each queued passive effect exactly once when an effect dispatches a click', () => {
		// Regression: drainPhase walked the LIVE queue; the dispatched click's handler
		// flushed synchronously and re-entered drainPhase over the same array,
		// re-running already-executed entries (real-world: Radix form bubble inputs
		// dispatch click/change from their sync effect — the form's onChange counter
		// exploded and the dispatch recursed to a stack overflow).
		const log: string[] = [];
		const r = mount(EffectDispatch, { log });
		flushEffects();
		expect(log).toEqual(['A', 'B']);
		expect(r.find('#count').textContent).toBe('1'); // handler ran exactly once
		r.unmount();
	});
});

describe('htmlFor alias', () => {
	it('renders the native `for` attribute (React parity, like className)', () => {
		const r = mount(LabelFor);
		const label = r.find('#lbl') as HTMLLabelElement;
		expect(label.getAttribute('for')).toBe('field');
		expect(label.hasAttribute('htmlfor')).toBe(false); // not a dead attribute
		expect(label.htmlFor).toBe('field');
		r.unmount();
	});
});

describe('invalid event delegation (capture phase, walking)', () => {
	it('fires onInvalid on the control AND its form ancestor', () => {
		// `invalid` doesn't bubble — bubble-phase delegation never saw it. It is now
		// capture-delegated with the focus/blur ancestor walk (React's onInvalid
		// observes descendants' invalid events, e.g. Radix Form focusing the first
		// invalid control from the form's handler).
		const log: string[] = [];
		const r = mount(InvalidEvents, { log });
		const input = r.find('#inp') as HTMLInputElement;
		input.dispatchEvent(new Event('invalid')); // non-bubbling, like the UA fires it
		expect(log).toEqual(['input', 'form']); // control first, then the ancestor walk
		r.unmount();
	});
});
