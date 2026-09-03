import { describe, it, expect } from 'vitest';
import { useState, useRef } from 'octane';
import { mount, act } from './_helpers';

// Zero-arg state/ref calls start undefined. The compiler reserves the authored
// initializer position with undefined before its slot, so a real Symbol
// initializer remains a value when a call is forwarded through a custom hook.

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

describe('zero-arg hooks (reserved initializer position)', () => {
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
