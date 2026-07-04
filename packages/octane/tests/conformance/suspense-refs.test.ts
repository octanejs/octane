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
	function setup() {
		const d = deferred<string>();
		const objRef = { current: null as Element | null };
		const cbLog: string[] = [];
		const cbRef = (el: Element | null) => {
			cbLog.push(el ? 'attach' : 'detach');
		};
		// Closure-attached flavors: a ref inside a SPREAD object, a Fragment ref
		// (FragmentInstance), and a ref on a value-position pure-host descriptor
		// (the de-opt path).
		const spreadRef = { current: null as Element | null };
		const fragRef = { current: null as any };
		const deoptRef = { current: null as Element | null };
		let go!: () => void;
		mount(App as any, {
			promise: d.promise,
			objRef,
			cbRef,
			sp: { ref: spreadRef },
			fRef: fragRef,
			dRef: deoptRef,
			bind: (f: () => void) => {
				go = f;
			},
		});
		return { d, objRef, cbLog, cbRef, spreadRef, fragRef, deoptRef, go: () => go() };
	}

	it('detaches host refs on suspend and re-attaches on reveal', async () => {
		const t = setup();
		await act(() => {});
		expect(t.objRef.current).not.toBe(null); // attached at mount
		const mountedNode = t.objRef.current;
		expect(t.cbLog.splice(0)).toEqual(['attach']);

		await act(() => t.go()); // boundary re-suspends → content hidden
		expect(t.objRef.current).toBe(null); // object ref CLEARED
		expect(t.cbLog.splice(0)).toEqual(['detach']); // callback ref called with null

		await act(() => t.d.resolve('x')); // reveal
		expect(t.objRef.current).not.toBe(null); // RESET (same preserved node)
		expect(t.objRef.current).toBe(mountedNode);
		expect(t.cbLog.splice(0)).toEqual(['attach']);
	});

	// Same ReactSuspenseEffectsSemantics-test.js:2877 contract for refs that are
	// attached through CLOSURES rather than compiled template slots: a ref inside
	// a spread, a <Fragment ref>, and a ref on a value-position pure-host
	// descriptor (de-opt path). React cycles them all — they are host refs.
	it('cycles spread, fragment, and de-opt descriptor refs across a suspend', async () => {
		const t = setup();
		await act(() => {});
		const spreadNode = t.spreadRef.current;
		const fragInstance = t.fragRef.current;
		const deoptNode = t.deoptRef.current;
		expect(spreadNode).not.toBe(null);
		expect(fragInstance).not.toBe(null);
		expect(deoptNode).not.toBe(null);

		await act(() => t.go()); // suspend → hidden
		expect(t.spreadRef.current).toBe(null);
		expect(t.fragRef.current).toBe(null);
		expect(t.deoptRef.current).toBe(null);

		await act(() => t.d.resolve('x')); // reveal
		expect(t.spreadRef.current).toBe(spreadNode); // same preserved node
		expect(t.fragRef.current).toBe(fragInstance); // same FragmentInstance
		expect(t.deoptRef.current).toBe(deoptNode);
	});
});
