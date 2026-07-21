import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'octane';
import { profiler } from 'octane/profiling';
import { act, mount } from './_helpers';

function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{count as string}</button>
}

afterEach(() => {
	profiler.stop();
	profiler.clear();
});

describe('runtime without the profile specialization', () => {
	it('does not record component work', async () => {
		profiler.clear();
		profiler.start({ timeline: false });
		const mounted = mount(Counter);

		await act(() => mounted.click('button'));

		expect(profiler.getEvents()).toEqual([]);
		mounted.unmount();
	});
});
