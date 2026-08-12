import { flushSync } from 'octane';
import { act, flushEffects, mount } from '../../octane/tests/_helpers';

import loader from './_mocks/loader';
import monaco from './_mocks/monaco';

export { act, flushEffects, mount, flushSync, loader, monaco };

export async function settle(turns = 4): Promise<void> {
	for (let i = 0; i < turns; i++) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	flushEffects();
	flushSync(() => {});
}
