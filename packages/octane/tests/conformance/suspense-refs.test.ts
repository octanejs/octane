import { describe, it, expect } from 'vitest';
import { mount, act } from '../_helpers';
import { App } from './_fixtures/suspense-refs.tsrx';

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

// Per ReactSuspenseEffectsSemantics-test.js:2877 "should be cleared and reset for host
// components". When a boundary suspends, host refs in the hidden subtree are detached
// (object refs → null, callback refs called with null) and re-attached on reveal — even
// though octane preserves the DOM node (React does too, with hidden=true).
describe('conformance: Suspense refs cleared on suspend, reset on reveal', () => {
	it('detaches host refs on suspend and re-attaches on reveal', async () => {
		const d = deferred<string>();
		const objRef = { current: null as Element | null };
		const cbLog: string[] = [];
		const cbRef = (el: Element | null) => {
			cbLog.push(el ? 'attach' : 'detach');
		};
		let go!: () => void;
		mount(App as any, {
			promise: d.promise,
			objRef,
			cbRef,
			bind: (f: () => void) => {
				go = f;
			},
		});
		await act(() => {});
		expect(objRef.current).not.toBe(null); // attached at mount
		const mountedNode = objRef.current;
		expect(cbLog.splice(0)).toEqual(['attach']);

		await act(() => go()); // boundary re-suspends → content hidden
		expect(objRef.current).toBe(null); // object ref CLEARED
		expect(cbLog.splice(0)).toEqual(['detach']); // callback ref called with null

		await act(() => d.resolve('x')); // reveal
		expect(objRef.current).not.toBe(null); // RESET (same preserved node)
		expect(objRef.current).toBe(mountedNode);
		expect(cbLog.splice(0)).toEqual(['attach']);
	});
});
