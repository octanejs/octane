import { describe, it, expect } from 'vitest';
import { act, mount } from './_helpers';
import { DeoptRefInBoundary } from './_fixtures/deopt-suspense-ref.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

function fulfilled(value: string) {
	const promise = Promise.resolve(value) as Promise<string> & {
		status?: string;
		value?: string;
	};
	promise.status = 'fulfilled';
	promise.value = value;
	return promise;
}

// A de-opt (value-position descriptor) host ref inside a @try boundary: hiding
// the boundary detaches the ref, the reveal re-attaches it. Protects the
// suspense hide/reveal walk over descriptor-stamped subtrees.
describe('de-opt descriptor refs across suspense hide/reveal', () => {
	it('detaches on hide and re-attaches on reveal (object ref)', async () => {
		const r: { current: Element | null } = { current: null };
		const m = mount(DeoptRefInBoundary as any, { promise: fulfilled('one'), r });
		expect((r.current as Element | null)?.id).toBe('deopt-target');

		const pending = deferred<string>();
		m.update(DeoptRefInBoundary as any, { promise: pending.promise, r });
		expect(m.container.querySelector('.fallback')).not.toBeNull();
		expect(r.current).toBeNull(); // hidden content's ref is detached

		await act(() => pending.resolve('two'));
		expect(m.container.querySelector('.fallback')).toBeNull();
		expect((r.current as Element | null)?.id).toBe('deopt-target'); // re-attached
		m.unmount();
		expect(r.current).toBeNull();
	});
});
