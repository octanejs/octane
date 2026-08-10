import { flushSync } from 'octane';
import { toast } from '@octanejs/sonner';
import { flushEffects, mount } from '../../octane/tests/_helpers';

export async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await new Promise(function (resolve) {
		setTimeout(resolve, 0);
	});
	flushEffects();
	flushSync(() => {});
}

export async function wait(ms: number): Promise<void> {
	await new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
	await settle();
}

// A toast leaves the DOM one `TIME_BEFORE_UNMOUNT` timer after it is dismissed,
// so sleeping for that exact budget makes every such assertion a race the test
// loses whenever the machine is loaded. Poll for the state being asserted
// instead; the caller still makes the real assertion afterwards.
export async function waitFor(condition: () => boolean, timeout = 2000): Promise<void> {
	const deadline = Date.now() + timeout;
	for (;;) {
		await settle();
		if (condition() || Date.now() >= deadline) return;
		await new Promise(function (resolve) {
			setTimeout(resolve, 10);
		});
	}
}

// Toasts are delivered to every mounted Toaster, so a root left behind by a
// failed assertion keeps rendering the next tests' toasts: it doubles
// `onAutoClose` counts and strands the listeners its Toast children registered.
// Unmounting only on the success path therefore turns one failure into several,
// which hides the test that actually broke.
const mountedRoots = new Set<{ unmount: () => void }>();

export function mountApp<P>(...args: Parameters<typeof mount<P>>): ReturnType<typeof mount<P>> {
	const root = mount<P>(...args);
	mountedRoots.add(root);
	return root;
}

export function unmountApp(root: { unmount: () => void }): void {
	if (mountedRoots.delete(root)) root.unmount();
}

export async function cleanupToasters(): Promise<void> {
	toast.dismiss();
	await wait(220);
	for (const root of [...mountedRoots]) unmountApp(root);
}
