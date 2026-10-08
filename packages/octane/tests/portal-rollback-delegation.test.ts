import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, mount } from './_helpers';
import {
	PortalRollback,
	RemovedPortalRollback,
	SuspendedPortalRollback,
} from './_fixtures/portal-rollback-delegation.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

const targets: Element[] = [];

function portalTarget(): Element {
	const target = document.createElement('div');
	document.body.appendChild(target);
	targets.push(target);
	return target;
}

afterEach(() => {
	for (const target of targets.splice(0)) target.remove();
});

// A root render that suspends with no Suspense boundary is discarded whole. A
// portal it created into a target that a committed portal also uses must give
// back only its own share of that target's delegated listeners, so the
// committed portal keeps receiving events.
describe('portal created by a discarded root render', () => {
	it.each([
		{ path: 'a component with a host-child portal', shape: 'host' },
		{ path: 'a component returning a portal', shape: 'value' },
		{ path: 'a host-child portal in a branch', shape: 'arm' },
		{ path: 'a committed value hole switching to a portal', shape: 'ternary' },
	] as const)(
		'leaves a committed portal in the same target interactive ($path)',
		async ({ shape }) => {
			const target = portalTarget();
			const pending = deferred<string>();
			let hits = 0;
			const onHit = () => hits++;
			const kept = () => target.querySelector('#kept') as HTMLElement;
			const props = { target, onHit, shape, promise: pending.promise };
			const root = mount(PortalRollback, { ...props, show: false });
			try {
				kept().click();
				expect(hits).toBe(1);

				root.update(PortalRollback, { ...props, show: true });
				expect(target.querySelectorAll('.fresh')).toHaveLength(0);
				expect(root.container.querySelector('.read')).toBeNull();
				kept().click();
				expect(hits).toBe(2);

				await act(async () => {
					pending.resolve('ready');
					await pending.promise;
				});
				expect(target.querySelectorAll('.fresh')).toHaveLength(1);
				expect(root.container.querySelector('.read')?.textContent).toBe('ready');
				kept().click();
				expect(hits).toBe(3);

				// Removing the committed second portal hands back its share alone.
				root.update(PortalRollback, { ...props, show: false });
				expect(target.querySelectorAll('.fresh')).toHaveLength(0);
				kept().click();
				expect(hits).toBe(4);
			} finally {
				root.unmount();
			}
			expect(target.childNodes).toHaveLength(0);
		},
	);

	it('leaves a committed portal interactive when the new portal content suspended', async () => {
		const target = portalTarget();
		const pending = deferred<string>();
		let hits = 0;
		const onHit = () => hits++;
		const kept = () => target.querySelector('#kept') as HTMLElement;
		const props = { target, onHit, promise: pending.promise };
		const root = mount(SuspendedPortalRollback, { ...props, show: false });
		try {
			root.update(SuspendedPortalRollback, { ...props, show: true });
			expect(target.querySelector('.read')).toBeNull();
			expect(root.container.querySelector('.fresh-owner')).toBeNull();
			kept().click();
			expect(hits).toBe(1);

			await act(async () => {
				pending.resolve('ready');
				await pending.promise;
			});
			expect(target.querySelector('.read')?.textContent).toBe('ready');

			root.update(SuspendedPortalRollback, { ...props, show: false });
			expect(target.querySelector('.read')).toBeNull();
			kept().click();
			expect(hits).toBe(2);
		} finally {
			root.unmount();
		}
		expect(target.childNodes).toHaveLength(0);
	});

	it.each([
		{ path: 'a host-child portal', value: false },
		{ path: 'a returned portal', value: true },
	])(
		'leaves a committed portal interactive when the render removed its new portal ($path)',
		async ({ value }) => {
			const target = portalTarget();
			const pending = deferred<string>();
			// First updates Stepper while rendering, which development builds report.
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			let hits = 0;
			const onHit = () => hits++;
			const kept = () => target.querySelector('#kept') as HTMLElement;
			const props = { target, onHit, value, promise: pending.promise };
			const root = mount(RemovedPortalRollback, { ...props, show: false });
			try {
				root.update(RemovedPortalRollback, { ...props, show: true });
				expect(target.querySelectorAll('.fresh')).toHaveLength(0);
				expect(root.container.querySelector('.read')).toBeNull();
				kept().click();
				expect(hits).toBe(1);

				await act(async () => {
					pending.resolve('ready');
					await pending.promise;
				});
				expect(root.container.querySelector('.read')?.textContent).toBe('ready');
				expect(target.querySelectorAll('.fresh')).toHaveLength(0);
				kept().click();
				expect(hits).toBe(2);
			} finally {
				root.unmount();
				error.mockRestore();
			}
			expect(target.childNodes).toHaveLength(0);
		},
	);
});
