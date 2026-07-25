import { describe, expect, it } from 'vitest';
import { Suspense, use } from 'octane';
import { act, mount } from './_helpers';
import type { OctaneDevtoolsHook } from '../src/devtools-hook';

function hook(): OctaneDevtoolsHook {
	const h = (globalThis as any).__OCTANE_DEVTOOLS__ as OctaneDevtoolsHook | undefined;
	if (!h) throw new Error('devtools hook not installed');
	return h;
}

function Deferred(props) @{
	const value = use(props.promise);
	<span>{value as string}</span>
}

function BoundaryApp(props) @{
	<Suspense fallback={<em>loading</em>}>
		<Deferred promise={props.promise} />
	</Suspense>
}

describe('runtime devtools transition/suspense probes (profile build)', () => {
	it('reports a Suspense boundary as pending, then resolved', async () => {
		let resolve: (v: string) => void = () => {};
		const promise = new Promise<string>((r) => (resolve = r));
		const { unmount } = mount(<BoundaryApp promise={promise} />);
		// A boundary exists and is pending (branch 2) while the promise is unresolved.
		expect(hook().getTransitionState().boundaries.some((b) => b.state === 'pending')).toBe(true);
		await act(async () => {
			resolve('done');
			await promise;
		});
		expect(hook().getTransitionState().boundaries.some((b) => b.state === 'resolved')).toBe(true);
		unmount();
		expect(hook().getTransitionState().boundaries).toEqual([]);
	});
});
