import { createElement } from 'octane';
import { createMemoryRouter, NavLink, Outlet } from '@octanejs/remix-router';
import { RouterProvider } from '@octanejs/remix-router/dom';
import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '../_helpers';
import { LoaderPage } from '../_fixtures/basic.tsrx';

function mountRoutes(loader?: () => { value: number }) {
	const router = createMemoryRouter([
		{
			element: createElement(
				'main',
				null,
				createElement(NavLink, { to: '/b', viewTransition: true }, 'B'),
				createElement(Outlet),
			),
			children: [
				{ index: true, element: createElement('h1', null, 'A') },
				{
					path: 'b',
					loader,
					element: loader ? createElement(LoaderPage) : createElement('h1', null, 'B'),
				},
				{ path: 'c', element: createElement('h1', null, 'C') },
			],
		},
	]);
	const view = mount(RouterProvider, { router });
	const transitions: {
		run: () => Promise<void>;
		finish: () => void;
		skip: ReturnType<typeof vi.fn>;
		linkWasTransitioning: boolean;
	}[] = [];
	// jsdom has no browser transition API. Hold both the update callback and the
	// animation finish so each navigation phase is externally observable.
	Object.defineProperty(document, 'startViewTransition', {
		configurable: true,
		value(run: () => Promise<void>) {
			const { promise: finished, resolve: finish } = Promise.withResolvers<void>();
			const skip = vi.fn();
			transitions.push({
				run,
				finish,
				skip,
				linkWasTransitioning: view.find('a').classList.contains('transitioning'),
			});
			return { finished, skipTransition: skip };
		},
	});
	return { router, view, transitions };
}
afterEach(() => {
	Reflect.deleteProperty(document, 'startViewTransition');
});

it.each([false, true])(
	'commits the view transition context before browser capture (flushSync=%s)',
	async (flushSync) => {
		const { router, view, transitions } = mountRoutes();
		try {
			await router.navigate('/b', { viewTransition: true, flushSync });
			await vi.waitFor(() => expect(transitions).toHaveLength(1));
			const transition = transitions[0]!;
			expect(transition.linkWasTransitioning).toBe(true);
			expect(view.find('h1').textContent).toBe('A');
			const updated = transition.run();
			if (flushSync) expect(view.find('h1').textContent).toBe('B');
			await updated;
			expect(view.find('h1').textContent).toBe('B');
			expect(view.find('a').classList.contains('transitioning')).toBe(true);
			transition.finish();
			await vi.waitFor(() =>
				expect(view.find('a').classList.contains('transitioning')).toBe(false),
			);
		} finally {
			view.unmount();
			router.dispose();
		}
	},
);

it('skips an interrupted animation, then commits the latest navigation after its predecessor finishes', async () => {
	const { router, view, transitions } = mountRoutes();
	try {
		await router.navigate('/b', { viewTransition: true });
		await vi.waitFor(() => expect(transitions).toHaveLength(1));
		const first = transitions[0]!;
		await first.run();
		expect(view.find('h1').textContent).toBe('B');
		await router.navigate('/c', { viewTransition: true });
		expect(first.skip).toHaveBeenCalled();
		expect(transitions).toHaveLength(1);
		expect(view.find('h1').textContent).toBe('B');
		first.finish();
		await vi.waitFor(() => expect(transitions).toHaveLength(2));
		const second = transitions[1]!;
		expect(second.linkWasTransitioning).toBe(true);
		await second.run();
		expect(view.find('h1').textContent).toBe('C');
		second.finish();
		await vi.waitFor(() => expect(view.find('a').classList.contains('transitioning')).toBe(false));
	} finally {
		view.unmount();
		router.dispose();
	}
});

it('a flush navigation supersedes an older browser callback without reverting its destination', async () => {
	const { router, view, transitions } = mountRoutes();
	try {
		await router.navigate('/b', { viewTransition: true });
		await vi.waitFor(() => expect(transitions).toHaveLength(1));
		const first = transitions[0]!;
		await router.navigate('/c', { viewTransition: true, flushSync: true });
		expect(first.skip).toHaveBeenCalled();
		expect(transitions).toHaveLength(2);
		const second = transitions[1]!;
		await second.run();
		await first.run();
		first.finish();
		expect(view.find('h1').textContent).toBe('C');
		expect(view.find('a').classList.contains('transitioning')).toBe(true);
		second.finish();
		await vi.waitFor(() => expect(view.find('a').classList.contains('transitioning')).toBe(false));
	} finally {
		view.unmount();
		router.dispose();
	}
});

it('cancels a held browser update when an ordinary navigation commits another destination', async () => {
	const { router, view, transitions } = mountRoutes();
	try {
		await router.navigate('/b', { viewTransition: true });
		await vi.waitFor(() => expect(transitions).toHaveLength(1));
		const first = transitions[0]!;
		await router.navigate('/c');
		await vi.waitFor(() => expect(view.find('h1').textContent).toBe('C'));
		expect(first.skip).toHaveBeenCalled();
		expect(view.find('a').classList.contains('transitioning')).toBe(false);
		await first.run();
		first.finish();
		expect(view.find('h1').textContent).toBe('C');
		expect(transitions).toHaveLength(1);
	} finally {
		view.unmount();
		router.dispose();
	}
});

it('retains newer loader data when the saved destination revalidates before its browser update', async () => {
	let value = 0;
	const { router, view, transitions } = mountRoutes(() => ({ value: ++value }));
	try {
		await router.navigate('/b', { viewTransition: true });
		await vi.waitFor(() => expect(transitions).toHaveLength(1));
		const transition = transitions[0]!;
		await router.revalidate();
		expect(view.find('h1').textContent).toBe('A');
		await transition.run();
		expect(view.find('p').textContent).toBe('data:2');
		expect(transition.skip).not.toHaveBeenCalled();
		transition.finish();
		await vi.waitFor(() => expect(view.find('a').classList.contains('transitioning')).toBe(false));
	} finally {
		view.unmount();
		router.dispose();
	}
});

it('a callback from a replaced router cannot commit into its replacement', async () => {
	const { router, view, transitions } = mountRoutes();
	const replacement = createMemoryRouter([
		{ path: '/', element: createElement('h1', null, 'Replacement') },
	]);
	try {
		await router.navigate('/b', { viewTransition: true });
		await vi.waitFor(() => expect(transitions).toHaveLength(1));
		const first = transitions[0]!;
		view.update(RouterProvider, { router: replacement });
		expect(first.skip).toHaveBeenCalled();
		await first.run();
		first.finish();
		expect(view.find('h1').textContent).toBe('Replacement');
	} finally {
		view.unmount();
		router.dispose();
		replacement.dispose();
	}
});
