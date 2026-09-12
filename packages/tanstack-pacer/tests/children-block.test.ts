import { afterEach, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { SchedulerChildren } from './_fixtures/pacer.tsrx';
afterEach(() => document.body.replaceChildren());
const schedulerNames = [
	'batcher',
	'debouncer',
	'queuer',
	'limiter',
	'throttler',
	'async batcher',
	'async debouncer',
	'async queuer',
	'async limiter',
	'async throttler',
];
it.each(schedulerNames)(
	'%s Subscribe renders template children and calls render props with selected state',
	(name) => {
		const kind = schedulerNames.indexOf(name);
		const result = mount(SchedulerChildren, { kind, revision: 0 });
		try {
			const node = result.find('#template');
			expect(node.textContent).toBe('0');
			expect(result.find('#callback').textContent).toBe('0');
			result.update(SchedulerChildren, { kind, revision: 1 });
			expect(result.find('#template')).toBe(node);
			expect(node.textContent).toBe('1');
			expect(result.find('#callback').textContent).toBe('1');
		} finally {
			result.unmount();
		}
	},
);
