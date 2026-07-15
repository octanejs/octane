import { describe, it, expect } from 'vitest';
import { useState, useRef } from 'octane';
import { mount, act } from './_helpers';

// Zero-arg `useState()` / `useRef()` (state/ref start undefined — React
// parity). The compiler appends the slot as the LAST argument, so these
// arrive as `useState(slot)` with the symbol in the initial-value position;
// the runtime must reinterpret the trailing symbol (same ABI rule as
// resolveHookArgs for optional-deps effects). Regression: before the
// reinterpretation, `useState<T>()` threw "called without a hook slot".

function ZeroArgState() @{
	const [value, setValue] = useState<string | undefined>();
	<button onClick={() => setValue('set')}>
		{value === undefined ? 'undef' : value}
	</button>
}

function ZeroArgRef() @{
	const ref = useRef<string | undefined>();
	if (ref.current === undefined) {
		ref.current = 'first';
	}
	<div>{ref.current}</div>
}

describe('zero-arg hooks (slot in first position)', () => {
	it('useState() starts undefined and updates', async () => {
		const r = mount(ZeroArgState);
		expect(r.container.textContent).toBe('undef');
		r.click('button');
		expect(r.container.textContent).toBe('set');
		r.unmount();
	});

	it('useRef() starts undefined', () => {
		const r = mount(ZeroArgRef);
		expect(r.container.textContent).toBe('first');
		r.unmount();
	});
});
