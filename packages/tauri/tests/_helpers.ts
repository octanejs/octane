export { mount, nextPaint, flushEffects, createLog, act } from '../../octane/tests/_helpers';

import { nextPaint } from '../../octane/tests/_helpers';

/**
 * Settle the IPC round trip. An in-flight `invoke` is invisible to the
 * scheduler, so `act` returns before the response reaches a hook; alternating
 * macrotasks with effect drains carries the resolution through to the DOM.
 */
export async function flush(): Promise<void> {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}
