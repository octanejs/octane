import { expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import {
	SchedulerDepthOrderingApp,
	DeepSchedulerApp,
	RunawaySchedulerApp,
	SiblingSchedulerApp,
	type SchedulerControls,
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

it('preserves update order for sibling layout notifications', () => {
	const first: SchedulerControls = {};
	const second: SchedulerControls = {};
	const commits: string[] = [];
	const r = mount(SiblingSchedulerApp, {
		first,
		second,
		onCommit: (label: string) => commits.push(label),
	});
	const firstNode = r.find('[data-counter="first"]');
	const secondNode = r.find('[data-counter="second"]');
	try {
		flushSync(() => {
			second.update!();
			first.update!();
		});
		expect(commits).toEqual(['second:1', 'first:1']);
		expect(r.find('[data-counter="first"]')).toBe(firstNode);
		expect(r.find('[data-counter="second"]')).toBe(secondNode);
		expect(firstNode.textContent).toBe('1');
		expect(secondNode.textContent).toBe('1');

		commits.length = 0;
		flushSync(() => {
			first.update!();
			second.update!();
		});
		expect(commits).toEqual(['first:2', 'second:2']);
		expect(firstNode.textContent).toBe('2');
		expect(secondNode.textContent).toBe('2');
	} finally {
		r.unmount();
	}
});

it('reports a render-loop error while committing an independent root', () => {
	const looping: SchedulerControls = {};
	const healthy: SchedulerControls = {};
	const failedRoot = mount(RunawaySchedulerApp, { controls: looping });
	const survivingRoot = mount(DeepSchedulerApp, { controls: healthy });
	const output = survivingRoot.find('output');
	try {
		expect(() =>
			flushSync(() => {
				looping.update!();
				healthy.update!();
			}),
		).toThrow(/Too many re-renders|error #9/);
		expect(failedRoot.container.textContent).toBe('');
		expect(survivingRoot.find('output')).toBe(output);
		expect(output.textContent).toBe('3');

		flushSync(() => healthy.remove!());
		expect(survivingRoot.container.textContent).toBe('removed');
		expect(output.isConnected).toBe(false);
	} finally {
		failedRoot.unmount();
		survivingRoot.unmount();
	}
});

it('converges deep render-phase updates across repeated batches and independent roots', () => {
	const first: SchedulerControls = {};
	const second: SchedulerControls = {};
	const a = mount(DeepSchedulerApp, { controls: first });
	const b = mount(DeepSchedulerApp, { controls: second });
	try {
		for (let i = 0; i < 3; i++) {
			flushSync(() => {
				second.update!();
				first.update!();
			});
			expect(a.find('output').textContent).toBe('3');
			expect(b.find('output').textContent).toBe('3');
		}
		flushSync(() => {
			first.update!();
			second.update!();
			first.remove!();
		});
		expect(a.container.textContent).toBe('removed');
		expect(b.find('output').textContent).toBe('3');
	} finally {
		a.unmount();
		b.unmount();
	}
});
