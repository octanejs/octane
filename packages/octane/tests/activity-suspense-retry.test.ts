import { expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { act, flushEffects, mount } from './_helpers';
import { SuspenseHideOwnershipActivity } from './_fixtures/activity.tsrx';

it('preserves visible content and DOM identity through a hidden Suspense retry', async () => {
	let setStage!: (stage: string) => void;
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((done) => (resolve = done));
	const expose = (setter: typeof setStage) => (setStage = setter);
	const props = { mode: 'visible', expose, promise };
	const r = mount(SuspenseHideOwnershipActivity, props);
	try {
		const stable = r.find('#activity-stable-display') as HTMLElement;
		expect(stable.style.display).toBe('inline-grid');

		flushSync(() => setStage('other'));
		flushEffects();
		const owned = r.find('#activity-owned-display') as HTMLElement;
		expect(r.find('#activity-stable-display')).toBe(stable);
		expect(owned.style.display).toBe('inline-flex');

		r.update(SuspenseHideOwnershipActivity, { ...props, mode: 'hidden' });
		flushEffects();
		expect(stable.style.display).toBe('none');
		expect(owned.style.display).toBe('none');

		flushSync(() => setStage('pending'));
		flushEffects();
		expect((r.find('#activity-owner-pending') as HTMLElement).style.display).toBe('none');

		await act(() => resolve('loaded'));
		flushEffects();
		const resolved = r.find('#activity-resolved-display') as HTMLElement;
		expect(resolved.textContent).toBe('loaded');
		expect(resolved.style.display).toBe('none');

		r.update(SuspenseHideOwnershipActivity, props);
		flushEffects();
		expect(r.find('#activity-stable-display')).toBe(stable);
		expect(stable.style.display).toBe('inline-grid');
		expect(resolved.style.display).toBe('block');
		expect(r.find('#activity-owned-display').textContent).toBe('new');
		expect(r.container.querySelector('#activity-owner-pending')).toBeNull();

		flushSync(() => setStage('other'));
		flushEffects();
		expect(r.find('#activity-stable-display')).toBe(stable);
		expect(r.find('#activity-late').textContent).toBe('late');
	} finally {
		r.unmount();
	}
});
