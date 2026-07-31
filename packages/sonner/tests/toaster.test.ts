import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { toast } from '@octanejs/sonner';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { ToastState } from '../src/state';
import { DualToasterApp, showCustom, SonnerStateProbe, ToasterApp } from './_fixtures/app.tsrx';

async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushEffects();
	flushSync(() => {});
}

async function wait(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
	await settle();
}

// A toast leaves the DOM one `TIME_BEFORE_UNMOUNT` timer after it is dismissed,
// so sleeping for that exact budget makes every such assertion a race the test
// loses whenever the machine is loaded. Poll for the state being asserted
// instead; the caller still makes the real assertion afterwards.
async function waitFor(condition: () => boolean, timeout = 2000): Promise<void> {
	const deadline = Date.now() + timeout;
	for (;;) {
		await settle();
		if (condition() || Date.now() >= deadline) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

// Toasts are delivered to every mounted Toaster, so a root left behind by a
// failed assertion keeps rendering the next tests' toasts: it doubles
// `onAutoClose` counts and strands the listeners its Toast children registered.
// Unmounting only on the success path therefore turns one failure into several,
// which hides the test that actually broke.
const mountedRoots = new Set<{ unmount: () => void }>();

function mountApp<P>(...args: Parameters<typeof mount<P>>): ReturnType<typeof mount<P>> {
	const root = mount<P>(...args);
	mountedRoots.add(root);
	return root;
}

function unmountApp(root: { unmount: () => void }): void {
	if (mountedRoots.delete(root)) root.unmount();
}

afterEach(async () => {
	toast.dismiss();
	await wait(220);
	for (const root of [...mountedRoots]) unmountApp(root);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('@octanejs/sonner — Toaster', () => {
	it('renders the upstream accessibility, data-attribute, content and style contract', async () => {
		const root = mountApp(ToasterApp, {
			theme: 'dark',
			richColors: true,
			position: 'top-center',
			offset: { top: 10, left: '2rem' },
		});
		await settle();
		const onDismiss = vi.fn();
		toast.success('Saved', {
			id: 'contract',
			description: 'Your changes were saved.',
			duration: Infinity,
			closeButton: true,
			testId: 'contract-toast',
			onDismiss,
		});
		await settle();

		const section = root.container.querySelector('section')!;
		const list = root.container.querySelector('[data-sonner-toaster]') as HTMLElement;
		const item = root.container.querySelector('[data-testid="contract-toast"]') as HTMLElement;
		expect(section.getAttribute('aria-label')).toBe('Notifications alt+T');
		expect(section.getAttribute('aria-live')).toBe('polite');
		expect(section.getAttribute('aria-relevant')).toBe('additions text');
		expect(list.getAttribute('data-sonner-theme')).toBe('dark');
		expect(list.getAttribute('data-y-position')).toBe('top');
		expect(list.getAttribute('data-x-position')).toBe('center');
		expect(list.style.getPropertyValue('--offset-top')).toBe('10px');
		expect(list.style.getPropertyValue('--offset-left')).toBe('2rem');
		expect(item.getAttribute('data-type')).toBe('success');
		expect(item.getAttribute('data-rich-colors')).toBe('true');
		expect(item.getAttribute('data-mounted')).toBe('true');
		expect(item.querySelector('[data-title]')?.textContent).toBe('Saved');
		expect(item.querySelector('[data-description]')?.textContent).toBe('Your changes were saved.');
		expect(item.querySelector('[data-icon] svg')).not.toBeNull();

		const close = item.querySelector('[data-close-button]') as HTMLButtonElement;
		flushSync(() => close.click());
		await settle();
		expect(item.getAttribute('data-removed')).toBe('true');
		expect(onDismiss).toHaveBeenCalledTimes(1);
		await waitFor(() => root.container.querySelector('[data-testid="contract-toast"]') === null);
		expect(root.container.querySelector('[data-testid="contract-toast"]')).toBeNull();
		unmountApp(root);
	});

	it('updates a toast in place and exposes active toasts through useSonner', async () => {
		const root = mountApp(SonnerStateProbe);
		await settle();
		toast('Before', { id: 'update', duration: Infinity });
		await settle();
		expect(root.container.querySelector('[data-testid="count"]')?.textContent).toBe('1');
		expect(root.container.querySelector('[data-testid="latest"]')?.textContent).toBe('Before');

		toast.success('After', {
			id: 'update',
			description: 'Updated description',
			duration: Infinity,
		});
		await settle();
		expect(root.container.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
		expect(root.container.querySelector('[data-testid="count"]')?.textContent).toBe('1');
		expect(root.container.querySelector('[data-testid="latest"]')?.textContent).toBe('After');
		expect(root.container.querySelector('[data-sonner-toast]')?.getAttribute('data-type')).toBe(
			'success',
		);
		unmountApp(root);
	});

	it('supports native action/cancel semantics and custom Octane elements', async () => {
		const root = mountApp(ToasterApp);
		await settle();
		const action = vi.fn((event: MouseEvent) => event.preventDefault());
		toast('Action toast', {
			id: 'action',
			duration: Infinity,
			action: { label: 'Keep', onClick: action },
			cancel: { label: 'Cancel', onClick: vi.fn() },
		});
		await settle();

		flushSync(() => (root.container.querySelector('[data-action]') as HTMLButtonElement).click());
		await settle();
		expect(action).toHaveBeenCalledTimes(1);
		expect(root.container.querySelector('[data-sonner-toast]')).not.toBeNull();

		flushSync(() => (root.container.querySelector('[data-cancel]') as HTMLButtonElement).click());
		await waitFor(() => root.container.querySelector('[data-sonner-toast]') === null);
		expect(root.container.querySelector('[data-sonner-toast]')).toBeNull();

		showCustom('custom');
		await settle();
		expect(root.container.querySelector('[data-testid="custom-content"]')?.textContent).toContain(
			'Custom content',
		);
		expect(
			root.container
				.querySelector('[data-testid="custom-content"]')
				?.closest('[data-sonner-toast]')
				?.getAttribute('data-styled'),
		).toBe('false');
		unmountApp(root);
	});

	it('routes targeted and global toasts to the matching Toaster', async () => {
		const root = mountApp(DualToasterApp);
		await settle();
		toast('Primary', { id: 'primary-toast', toasterId: 'primary', duration: Infinity });
		toast('Secondary', {
			id: 'secondary-toast',
			toasterId: 'secondary',
			duration: Infinity,
		});
		toast('Global', { id: 'global-toast', duration: Infinity });
		await settle();

		const lists = [...root.container.querySelectorAll('[data-sonner-toaster]')];
		const primary = lists.find((list) => list.getAttribute('data-x-position') === 'right')!;
		const secondary = lists.find((list) => list.getAttribute('data-x-position') === 'left')!;
		expect(primary.textContent).toContain('Primary');
		expect(primary.textContent).not.toContain('Secondary');
		expect(secondary.textContent).toContain('Secondary');
		expect(root.container.textContent).toContain('Global');
		unmountApp(root);
	});

	it('collapses a targeted Toaster when only one of its own toasts remains', async () => {
		const root = mountApp(DualToasterApp);
		await settle();
		toast('Primary one', {
			id: 'primary-one',
			toasterId: 'primary',
			duration: Infinity,
		});
		toast('Primary two', {
			id: 'primary-two',
			toasterId: 'primary',
			duration: Infinity,
		});
		toast('Secondary', {
			id: 'secondary-collapse',
			toasterId: 'secondary',
			duration: Infinity,
		});
		await settle();

		document.dispatchEvent(
			new KeyboardEvent('keydown', { code: 'KeyT', altKey: true, bubbles: true }),
		);
		await settle();
		const primaryList = [...root.container.querySelectorAll('[data-sonner-toaster]')].find((list) =>
			list.textContent?.includes('Primary one'),
		)!;
		expect(primaryList.querySelector('[data-sonner-toast]')?.getAttribute('data-expanded')).toBe(
			'true',
		);

		toast.dismiss('primary-two');
		await waitFor(
			() =>
				primaryList.querySelector('[data-sonner-toast]')?.getAttribute('data-expanded') === 'false',
		);
		expect(primaryList.querySelector('[data-sonner-toast]')?.getAttribute('data-expanded')).toBe(
			'false',
		);
		unmountApp(root);
	});

	it('uses the front toast height from each position list', async () => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			const height = this.textContent?.includes('Top')
				? 70
				: this.textContent?.includes('Bottom')
					? 30
					: 0;
			return {
				x: 0,
				y: 0,
				width: 0,
				height,
				top: 0,
				right: 0,
				bottom: height,
				left: 0,
				toJSON: () => ({}),
			};
		});
		const root = mountApp(ToasterApp);
		await settle();
		toast('Bottom', { id: 'bottom-height', duration: Infinity });
		toast('Top', {
			id: 'top-height',
			position: 'top-left',
			duration: Infinity,
		});
		await settle();

		const lists = [...root.container.querySelectorAll('[data-sonner-toaster]')] as HTMLElement[];
		const bottom = lists.find((list) => list.textContent?.includes('Bottom'))!;
		const top = lists.find((list) => list.textContent?.includes('Top'))!;
		expect(bottom.style.getPropertyValue('--front-toast-height')).toBe('30px');
		expect(top.style.getPropertyValue('--front-toast-height')).toBe('70px');
		unmountApp(root);
	});

	it('runs promise loading, extended success, finally and unwrap semantics', async () => {
		const root = mountApp(ToasterApp);
		await settle();
		let resolve!: (value: { name: string }) => void;
		const pending = new Promise<{ name: string }>((done) => {
			resolve = done;
		});
		const finallyCallback = vi.fn();
		const promiseToast = toast.promise(pending, {
			id: 'promise',
			testId: 'promise-toast',
			loading: 'Loading...',
			success: (data) => ({
				message: `${data.name} saved`,
				description: 'Promise complete',
				duration: Infinity,
			}),
			error: 'Failed',
			finally: finallyCallback,
		});
		await settle();
		expect(root.container.querySelector('[data-testid="promise-toast"]')?.textContent).toContain(
			'Loading...',
		);

		resolve({ name: 'Project' });
		await expect(promiseToast.unwrap()).resolves.toEqual({ name: 'Project' });
		await settle();
		const item = root.container.querySelector('[data-testid="promise-toast"]')!;
		expect(item.textContent).toContain('Project saved');
		expect(item.textContent).toContain('Promise complete');
		expect(item.getAttribute('data-type')).toBe('success');
		expect(finallyCallback).toHaveBeenCalledTimes(1);
		unmountApp(root);
	});

	it('focuses with the default hotkey and restores the previously focused element', async () => {
		const root = mountApp(ToasterApp);
		await settle();
		toast('Keyboard toast', { id: 'keyboard', duration: Infinity });
		await settle();
		const origin = root.container.querySelector('[data-testid="origin"]') as HTMLButtonElement;
		origin.focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { code: 'KeyT', altKey: true, bubbles: true }),
		);
		await settle();
		const list = root.container.querySelector('[data-sonner-toaster]') as HTMLOListElement;
		expect(document.activeElement).toBe(list);

		origin.focus();
		await settle();
		expect(document.activeElement).toBe(origin);
		unmountApp(root);
	});

	it('auto-closes finite toasts and calls onAutoClose once', async () => {
		const root = mountApp(ToasterApp);
		await settle();
		const onAutoClose = vi.fn();
		toast('Timed toast', {
			id: 'timed',
			duration: 60,
			onAutoClose,
		});
		await settle();
		expect(root.container.querySelector('[data-sonner-toast]')).not.toBeNull();

		await waitFor(
			() =>
				root.container.querySelector('[data-sonner-toast]')?.getAttribute('data-removed') ===
				'true',
		);
		expect(onAutoClose).toHaveBeenCalledTimes(1);
		expect(root.container.querySelector('[data-sonner-toast]')?.getAttribute('data-removed')).toBe(
			'true',
		);
		await waitFor(() => root.container.querySelector('[data-sonner-toast]') === null);
		expect(root.container.querySelector('[data-sonner-toast]')).toBeNull();
		unmountApp(root);
	});

	it('dismisses with an allowed pointer swipe and reports its direction', async () => {
		const root = mountApp(ToasterApp);
		await settle();
		const onDismiss = vi.fn();
		toast('Swipe toast', {
			id: 'swipe',
			duration: Infinity,
			onDismiss,
		});
		await settle();
		const item = root.container.querySelector('[data-sonner-toast]') as HTMLElement;
		(item as any).setPointerCapture = () => {};
		const pointer = (type: string, clientX: number): MouseEvent => {
			const event = new MouseEvent(type, {
				bubbles: true,
				cancelable: true,
				button: 0,
				clientX,
				clientY: 0,
			});
			Object.defineProperty(event, 'pointerId', { value: 1 });
			return event;
		};

		flushSync(() => item.dispatchEvent(pointer('pointerdown', 0)));
		flushSync(() => item.dispatchEvent(pointer('pointermove', 60)));
		flushSync(() => item.dispatchEvent(pointer('pointermove', 60)));
		flushSync(() => item.dispatchEvent(pointer('pointerup', 60)));
		await settle();
		expect(item.getAttribute('data-swipe-out')).toBe('true');
		expect(item.getAttribute('data-swipe-direction')).toBe('right');
		expect(onDismiss).toHaveBeenCalledTimes(1);
		await waitFor(() => root.container.querySelector('[data-sonner-toast]') === null);
		expect(root.container.querySelector('[data-sonner-toast]')).toBeNull();
		unmountApp(root);
	});

	it('subscribes to toast state once for the lifetime of the Toaster', async () => {
		const subscribe = vi.spyOn(ToastState, 'subscribe');
		const root = mountApp(ToasterApp);
		await settle();
		expect(subscribe).toHaveBeenCalledTimes(1);

		toast('First', { id: 'subscription', duration: Infinity });
		await settle();
		toast.success('Updated', { id: 'subscription', duration: Infinity });
		await settle();
		expect(subscribe).toHaveBeenCalledTimes(1);

		unmountApp(root);
		subscribe.mockRestore();
	});

	it('removes the document visibility listener when a toast unmounts', async () => {
		const add = vi.spyOn(document, 'addEventListener');
		const remove = vi.spyOn(document, 'removeEventListener');
		const root = mountApp(ToasterApp);
		await settle();
		toast('Visibility', { id: 'visibility', duration: Infinity });
		await settle();

		const visibilityRegistration = add.mock.calls.find(
			([eventName]) => eventName === 'visibilitychange',
		);
		expect(visibilityRegistration).toBeDefined();
		unmountApp(root);
		await settle();
		expect(remove).toHaveBeenCalledWith('visibilitychange', visibilityRegistration?.[1]);

		add.mockRestore();
		remove.mockRestore();
	});

	it('removes the system theme media-query listener on unmount', async () => {
		const addEventListener = vi.fn();
		const removeEventListener = vi.fn();
		const mediaQuery = {
			matches: false,
			addEventListener,
			removeEventListener,
			addListener: vi.fn(),
			removeListener: vi.fn(),
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => mediaQuery),
		);

		const root = mountApp(ToasterApp, { theme: 'system' });
		await settle();
		expect(addEventListener).toHaveBeenCalledTimes(1);
		const listener = addEventListener.mock.calls[0][1];
		unmountApp(root);
		await settle();
		expect(removeEventListener).toHaveBeenCalledWith('change', listener);
	});
});
