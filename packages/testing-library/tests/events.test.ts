/**
 * `fireEvent` conformance — ports of react-testing-library@be9d81d
 * src/__tests__/events.js, re-authored for octane's NATIVE event model.
 * Octane has no synthetic event layer, so fireEvent is dom-testing-library's
 * verbatim; the octane-specific guarantee under test is COMMIT TIMING — every
 * dispatch's state updates and effects are committed before fireEvent returns
 * (RTL gets this from wrapping dispatch in React act()).
 *
 * Native-event divergence cases that authenticate React remapping differences
 * live in `events-native-parity.test.ts` as ordinary framework-contract coverage.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@octanejs/testing-library';
import { Counter, EffectfulCounter, InputEcho } from './_fixtures/counter.tsrx';

afterEach(cleanup);

describe('fireEvent + state updates', () => {
	// Per react-testing-library src/__tests__/events.js:216 ("calling `fireEvent`
	// directly works too") — click through the generic entry point.
	it('fireEvent(node, event) dispatches and commits synchronously', () => {
		const { getByText } = render(Counter);
		fireEvent(getByText('Count: 0'), new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(getByText('Count: 1')).toBeTruthy();
	});

	// Per events.js:154 (the delegated convenience methods trigger handlers)
	it('fireEvent.click commits the update before returning', () => {
		render(Counter);
		fireEvent.click(screen.getByRole('button'));
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByRole('button').textContent).toBe('Count: 2');
	});

	// Per act.js:20 ("fireEvent triggers useEffect calls")
	it('fireEvent flushes the effects the update schedules', () => {
		const callback = vi.fn();
		render(EffectfulCounter, { props: { callback } });
		const afterMount = callback.mock.calls.length;
		expect(afterMount).toBeGreaterThan(0);
		fireEvent.click(screen.getByRole('button'));
		expect(callback.mock.calls.length).toBe(afterMount + 1);
	});

	it('fireEvent.input drives native onInput state', () => {
		const { getByLabelText, getByTestId } = render(InputEcho);
		fireEvent.input(getByLabelText('name'), { target: { value: 'octane' } });
		expect(getByTestId('echo').textContent).toBe('octane');
	});
});
