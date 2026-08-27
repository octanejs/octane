import { expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import {
	SchedulerDepthOrderingApp,
	queueDescendantBeforeRemoval,
} from './_fixtures/scheduler-depth-ordering.tsx';

it('drains a queued ancestor before stale work in a descendant it removes', () => {
	const r = mount(SchedulerDepthOrderingApp);
	const child = r.find('.child');

	expect(() => flushSync(queueDescendantBeforeRemoval)).not.toThrow();
	expect(child.isConnected).toBe(false);
	expect(r.find('.removed').textContent).toBe('removed');

	r.unmount();
});
