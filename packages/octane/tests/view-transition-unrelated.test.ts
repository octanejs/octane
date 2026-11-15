import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from './_helpers';
import { createRoot, startTransition, type Root } from '../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import { UnrelatedRootsApp, UnrelatedSidebar } from './_fixtures/view-transition-unrelated.tsrx';

describe('ViewTransition across roots', () => {
	let vt: ViewTransitionMocks;
	let a: HTMLElement;
	let b: HTMLElement;
	let rootA: Root;
	let rootB: Root;

	beforeEach(() => {
		vt = installViewTransitionMocks();
		a = document.body.appendChild(document.createElement('div'));
		b = document.body.appendChild(document.createElement('div'));
		rootA = createRoot(a);
		rootB = createRoot(b);
	});
	afterEach(() => {
		rootA.unmount();
		rootB.unmount();
		a.remove();
		b.remove();
		vt.restore();
	});

	it('does not run enter on an unchanged boundary in another root', async () => {
		const entered: string[] = [];
		const onEnter = (instance: { name: string }) => {
			entered.push(instance.name);
		};
		await act(() => {
			rootB.render(UnrelatedSidebar, { onEnter });
			rootA.render(UnrelatedRootsApp, { text: 'one', onUpdate: () => {} });
		});
		entered.length = 0;
		const sidebarClasses: string[] = [];
		const label = b.querySelector('#sidebar-label') as HTMLElement;
		const origSVT = (document as never as Record<string, any>)['startViewTransition'];
		(document as never as Record<string, any>)['startViewTransition'] = (opts: {
			update: () => void;
		}) =>
			origSVT({
				update: () => {
					opts.update();
					sidebarClasses.push(label.style.getPropertyValue('view-transition-class'));
				},
			});
		try {
			await act(() => {
				startTransition(() => {
					rootA.render(UnrelatedRootsApp, {
						text: 'a much longer second text',
						onUpdate: () => {},
					});
				});
			});
		} finally {
			(document as never as Record<string, any>)['startViewTransition'] = origSVT;
		}
		expect(vt.calls.length).toBe(1);
		expect(entered).toEqual([]);
		expect(sidebarClasses).toEqual(['']);
	});
});
