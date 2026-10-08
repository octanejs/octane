import { describe, expect, it, vi } from 'vitest';
import { act, mount } from './_helpers';
import {
	FreshParentSwap,
	FreshPortalSuspends,
	HeldBoundaryPortal,
} from './_fixtures/root-rollback-nested-created.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

function portalTarget(): HTMLElement {
	const target = document.createElement('div');
	target.id = 'portal-target';
	document.body.appendChild(target);
	return target;
}

// A held update must leave a portal target exactly as it was: no content, no
// range markers, from any component the abandoned render created.
function expectUntouched(target: HTMLElement): void {
	expect(target.childNodes).toHaveLength(0);
}

describe('content created inside a newly created subtree, abandoned by a held root render', () => {
	it('removes a portal whose content suspended before it finished mounting', async () => {
		const pending = deferred<string>();
		const target = portalTarget();
		const root = mount(FreshPortalSuspends, {
			show: false,
			label: 'initial',
			promise: fulfilled('ready'),
			target,
		});
		try {
			const label = root.find('#label');
			root.update(FreshPortalSuspends, {
				show: true,
				label: 'next',
				promise: pending.promise,
				target,
			});
			expect(root.find('#label')).toBe(label);
			expect(label.textContent).toBe('initial');
			expect(root.findAll('.modal-owner')).toHaveLength(0);
			expectUntouched(target);

			await act(() => pending.resolve('loaded'));
			expect(label.textContent).toBe('next');
			expect(root.findAll('.modal-owner')).toHaveLength(1);
			expect(target.querySelectorAll('.modal')).toHaveLength(1);
			expect(target.querySelector('.read')!.textContent).toBe('loaded');

			root.update(FreshPortalSuspends, {
				show: false,
				label: 'closed',
				promise: fulfilled('ready'),
				target,
			});
			expect(label.textContent).toBe('closed');
			expect(target.querySelectorAll('.modal')).toHaveLength(0);
		} finally {
			root.unmount();
			target.remove();
		}
	});

	it('removes the replacement a new component rendered before the root suspended', async () => {
		const pending = deferred<string>();
		const target = portalTarget();
		// First updates Stepper while rendering, which development builds report.
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(FreshParentSwap, {
			show: false,
			label: 'initial',
			promise: fulfilled('ready'),
			target,
		});
		try {
			const label = root.find('#label');
			root.update(FreshParentSwap, {
				show: true,
				label: 'next',
				promise: pending.promise,
				target,
			});
			expect(root.find('#label')).toBe(label);
			expect(label.textContent).toBe('initial');
			expect(root.findAll('.tip-anchor')).toHaveLength(0);
			expectUntouched(target);

			await act(() => pending.resolve('loaded'));
			expect(label.textContent).toBe('next');
			expect(root.find('.second .read').textContent).toBe('loaded');
			expect(target.querySelectorAll('.tip')).toHaveLength(1);
			expect(target.querySelector('.tip')!.textContent).toBe('second');

			root.update(FreshParentSwap, {
				show: false,
				label: 'closed',
				promise: fulfilled('ready'),
				target,
			});
			expect(target.querySelectorAll('.tip')).toHaveLength(0);
		} finally {
			root.unmount();
			target.remove();
			error.mockRestore();
		}
	});

	it('removes it when a committed boundary holds a transition instead', async () => {
		const pending = deferred<string>();
		const target = portalTarget();
		const root = mount(HeldBoundaryPortal, { promise: pending.promise, target });
		try {
			const stable = root.find('#stable');
			root.click('#open');
			await act(async () => {
				for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
			});
			expect(root.find('#stable')).toBe(stable);
			expect(root.findAll('#fallback')).toHaveLength(0);
			expect(root.findAll('.modal-owner')).toHaveLength(0);
			expectUntouched(target);

			await act(() => pending.resolve('loaded'));
			expect(root.find('#stable')).toBe(stable);
			expect(root.findAll('.modal-owner')).toHaveLength(1);
			expect(target.querySelectorAll('.modal')).toHaveLength(1);
			expect(target.querySelector('.read')!.textContent).toBe('loaded');
		} finally {
			root.unmount();
			target.remove();
		}
		expect(target.querySelectorAll('.modal')).toHaveLength(0);
	});
});
