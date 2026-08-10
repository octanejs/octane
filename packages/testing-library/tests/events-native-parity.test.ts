/**
 * Ordinary coverage for native event semantics that intentionally differ from
 * React Testing Library's synthetic remapping. This is Octane framework-contract
 * coverage, not adapted React parity evidence.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@octanejs/testing-library';
import { EventLog, CheckableEventLog, HoverTarget } from './_fixtures/counter.tsrx';

afterEach(cleanup);

describe('native event semantics (intentional divergence from React)', () => {
	// Per events.js:207 ("onChange works") — with the OCTANE meaning: onChange
	// is the native `change` event, so fireEvent.change fires it…
	it('fireEvent.change fires the native change handler', () => {
		const log = vi.fn();
		const { getByLabelText } = render(EventLog, { props: { log } });
		fireEvent.change(getByLabelText('field'), { target: { value: 'abc' } });
		expect(log.mock.calls).toEqual([['change']]);
	});

	// …and — unlike React, where onChange handlers run off native `input` —
	// fireEvent.input does NOT reach onChange. Pins the divergence the README
	// documents: port React tests by firing the event the handler really means.
	it('fireEvent.input does NOT trigger onChange (no synthetic remap)', () => {
		const log = vi.fn();
		const { getByLabelText } = render(EventLog, { props: { log } });
		fireEvent.input(getByLabelText('field'), { target: { value: 'abc' } });
		expect(log.mock.calls).toEqual([['input']]);
	});

	it('fireEvent.change on a checkbox is an explicit change dispatch, not click activation', () => {
		const log = vi.fn();
		const { getByLabelText } = render(CheckableEventLog, { props: { log } });
		const checkbox = getByLabelText('enabled') as HTMLInputElement;
		fireEvent.change(checkbox, { target: { checked: true } });
		expect(checkbox.checked).toBe(true);
		expect(log.mock.calls).toEqual([['change']]);
	});

	// RTL double-dispatches mouseEnter as mouseover to feed React's plugin
	// system; octane's onMouseEnter receives the REAL mouseenter (non-bubbling
	// events are capture-delegated), so the single dispatch is enough.
	it('fireEvent.mouseEnter triggers onMouseEnter without a mouseover remap', () => {
		const log = vi.fn();
		const { getByTestId } = render(HoverTarget, { props: { log } });
		fireEvent.mouseEnter(getByTestId('hover'));
		expect(log.mock.calls).toEqual([['enter']]);
	});
});
