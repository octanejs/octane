import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';

export type TrackedRoot = { unmount: () => void };

export function createRootTracker() {
	const roots: TrackedRoot[] = [];
	function tracked(...args: Parameters<typeof mount<any>>) {
		const root = mount<any>(...args);
		roots.push(root);
		return root;
	}
	function cleanup() {
		for (const root of roots.splice(0)) root.unmount();
	}
	return { tracked, cleanup, roots };
}

export function settle() {
	flushEffects();
	flushSync(function flush() {});
}
