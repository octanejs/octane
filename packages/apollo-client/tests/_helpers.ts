import { flushSync } from 'octane';

import { flushEffects, mount, nextPaint } from '../../octane/tests/_helpers';

export { flushEffects, mount, nextPaint };

/**
 * Drain Octane effects, Apollo/RxJS microtasks, and zero-delay MockLink work.
 * Apollo deliberately schedules ObservableQuery notifications through RxJS's
 * asap scheduler, so a synchronous root flush alone is not sufficient.
 */
export async function settle(ms = 0): Promise<void> {
	flushEffects();
	await new Promise((resolve) => setTimeout(resolve, ms));
	for (let index = 0; index < 4; index++) {
		await Promise.resolve();
		flushSync(() => {});
		await nextPaint();
	}
}
