import { describe, it, expect } from 'vitest';
import { createRoot, flushSync } from '../src/index';
import { Shell } from './_fixtures/dedup-shell.tsrx';
import { Btn } from './_fixtures/dedup-btn.tsrx';

describe('delegated event dispatch — nested delegation targets', () => {
	it('dispatches a handler exactly once when an inner root nests inside an outer root', () => {
		const outer = document.createElement('div');
		document.body.appendChild(outer);
		const outerRoot = createRoot(outer);
		flushSync(() => outerRoot.render(Shell));

		const host = outer.querySelector('.host') as HTMLElement;
		const innerRoot = createRoot(host);
		let calls = 0;
		flushSync(() => innerRoot.render(Btn as any, { onClick: () => calls++ }));

		flushSync(() => (host.querySelector('.b') as HTMLElement).click());
		// Both `host` (inner root) and `outer` (outer root) carry a click delegation
		// listener; without dedup each re-walks the shared chain → handler fires twice.
		expect(calls).toBe(1);

		innerRoot.unmount();
		outerRoot.unmount();
		outer.remove();
	});
});
