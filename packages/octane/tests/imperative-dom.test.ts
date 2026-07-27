import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from './differential/_rig.js';

const FIXTURE = resolve(__dirname, '_fixtures/imperative-dom.tsrx');

// The renderer manages the children it created and nothing else. Code that fills an element by
// other means — `replaceChildren` with a captured DOM snapshot, a third-party widget mounting into
// a container — must not have that content swept away by an unrelated re-render. React behaves this
// way, so these run through both renderers and compare.
describe('DOM the renderer did not create', () => {
	it('survives a re-render of the element it was inserted into', async () => {
		const d = await mountDifferential(FIXTURE, 'ImperativeChildrenSurvive', undefined, undefined);
		await d.observe('insert', (i, r) => {
			for (const m of [i, r]) {
				const host = m.container.querySelector('.host')!;
				host.appendChild(
					Object.assign(document.createElement('span'), { className: 'imp', textContent: 'X' }),
				);
			}
		});
		await d.step('re-render the host', (i, r) => {
			for (const m of [i, r]) (m.container.querySelector('.bump') as HTMLElement).click();
		});
		await d.observe('assert', (i) => {
			// The host re-rendered (its prop changed) and the foreign node is still there.
			expect(i.container.querySelector('.host')!.getAttribute('data-n')).toBe('1');
			expect(i.container.querySelector('.imp')?.textContent).toBe('X');
		});
		d.unmount();
	});

	it('does not stop the renderer clearing children it did create', async () => {
		const d = await mountDifferential(FIXTURE, 'OwnedChildrenStillClear', undefined, undefined);
		await d.observe('mounted', (i) => {
			expect(i.container.querySelector('.mine')).not.toBe(null);
		});
		await d.step('hide', (i, r) => {
			for (const m of [i, r]) (m.container.querySelector('.toggle') as HTMLElement).click();
		});
		await d.observe('assert', (i) => {
			expect(i.container.querySelector('.mine')).toBe(null);
		});
		d.unmount();
	});

	it('survives insertion after the renderer clears its own children', async () => {
		const d = await mountDifferential(
			FIXTURE,
			'ForeignDomAfterOurChildrenClear',
			undefined,
			undefined,
		);
		await d.step('clear our child', (i, r) => {
			for (const m of [i, r]) (m.container.querySelector('.next') as HTMLElement).click();
		});
		await d.observe('insert into the now-empty host', (i, r) => {
			for (const m of [i, r]) {
				m.container
					.querySelector('.clearing')!
					.appendChild(
						Object.assign(document.createElement('b'), { className: 'late', textContent: 'L' }),
					);
			}
		});
		await d.step('re-render again', (i, r) => {
			for (const m of [i, r]) (m.container.querySelector('.next') as HTMLElement).click();
		});
		await d.observe('assert', (i) => {
			// Our child went away two renders ago, so the element is no longer ours to clear.
			expect(i.container.querySelector('.late')?.textContent).toBe('L');
		});
		d.unmount();
	});
});
