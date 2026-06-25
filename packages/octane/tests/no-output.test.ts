import { describe, it, expect, vi } from 'vitest';
import { mount } from './_helpers';
import { NoOutputHost } from './_fixtures/no-output.tsrx';

// A component need not produce output. A `@{}` with no trailing TSRX fragment (or
// a function with no return) returns `undefined`, which the renderable path treats
// as "render nothing" — while still running the component's setup/hooks.
describe('component with no output node (returns undefined)', () => {
	it('renders nothing but still runs setup, and siblings render normally', () => {
		const onSetup = vi.fn();
		const r = mount(NoOutputHost as any, { onSetup });
		// <NoOutput/> contributes no DOM; only the sibling text remains.
		expect(r.find('div').textContent).toBe('tail');
		// ...but its setup ran.
		expect(onSetup).toHaveBeenCalledTimes(1);
		r.unmount();
	});
});
