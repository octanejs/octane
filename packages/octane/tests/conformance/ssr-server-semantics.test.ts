import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';

// Conformance port of facebook/react's "what runs on the server" semantics —
// ReactDOMServerIntegrationHooks-test.js (hooks render initial values; effects /
// imperative handles are no-ops), ReactDOMServerIntegrationRefs-test.js (ref
// callbacks never run server-side, DO run against the adopted node on the
// client), and the ReactDOMFizzForm-test.js server-hook outcomes (useFormStatus
// is not pending, useActionState / useOptimistic return their initial state).
//
// Covered by existing suites (not re-ported here):
//   * useEffect no-op + useMemo + useId determinism — tests/ssr.test.ts (HookView)
//     and conformance/useid-determinism.test.ts.
//   * context on the server — tests/hydration/provider-ssr-hydrate.test.ts,
//     tests/jsx-context-children-ssr.test.ts.
//   * function-valued form `action` never serializes — tests/ssr.test.ts
//     ("React 19 function form actions", Per ReactDOMFizzForm-test.js:93).
//   * user-typed values survive hydration — conformance/user-input-hydration.test.ts.
//
// Out of scope per docs/react-parity-migration-plan.md §2 (documented, skipped):
//   * class-component variants (Refs :43 RefsComponent-as-class ported as a
//     function component; Hooks :656 useContext-in-class skipped).
//   * rules-of-hooks warnings (Hooks :419/:437/:680) — octane has no hook rules.
//   * Fizz streaming replay of PRE-hydration submits (FizzForm :458/:487) — octane
//     has no synthetic-event replay (streaming section of the plan); the
//     post-hydration outcome half is asserted below, and the no-replay behavior is
//     pinned as the documented divergence.
//   * `$$FORM_ACTION` custom server-action serialization (FizzForm :571/:625/:706)
//     — RSC/Flight-adjacent machinery octane does not implement.

const FILE = 'ssr-server-semantics.tsrx';

const SRC = `
import { useState, useReducer, useMemo, useRef, useCallback, useEffect, useLayoutEffect, useInsertionEffect, useImperativeHandle, useDebugValue, useFormStatus, useActionState, useOptimistic } from 'octane';

// ---- hooks render initial values ----
export function StateText(p) @{
	const [count, setCount] = useState(0);
	if (p.captureSet) p.captureSet(setCount);
	<span>{'Count: ' + count}</span>
}
export function LazyState(p) @{
	const [count] = useState(() => {
		p.onInit();
		return 0;
	});
	<span>{'Count: ' + count}</span>
}
export function RenderPhaseState() @{
	const [count, setCount] = useState(0);
	if (count < 3) {
		setCount(count + 1);
	}
	<span>{'Count: ' + count}</span>
}
export function ReducerText(p) @{
	const [count] = useReducer((s, a) => (a === 'increment' ? s + 1 : s), p.initial);
	<span>{'Count: ' + count}</span>
}
export function LazyReducer(p) @{
	const [count] = useReducer((s) => s, p.initial, (x) => {
		p.onInit(x);
		return x * 2;
	});
	<span>{'Count: ' + count}</span>
}
export function MemoText(p) @{
	const value = useMemo(() => {
		p.onCompute();
		return p.text.toUpperCase();
	}, [p.text]);
	<span>{'Value: ' + value}</span>
}
export function RefInitial() @{
	const ref = useRef(0);
	<span>{'Count: ' + ref.current}</span>
}

// ---- effects / imperative handles do not run ----
export function EffectsText(p) @{
	useEffect(() => p.onRun('effect'));
	useLayoutEffect(() => p.onRun('layout'));
	useInsertionEffect(() => p.onRun('insertion'));
	<span>{'Count: 0'}</span>
}
export function CallbackText(p) @{
	const cb = useCallback(p.callback, []);
	<span>{'Type: ' + typeof cb}</span>
}
export function RenderTimeCallback(p) @{
	const renderCount = useCallback((inc) => 'Count: ' + (p.count + inc), [p.count]);
	<span>{renderCount(3) as string}</span>
}
export function ImperativeText(p) @{
	useImperativeHandle(p.fwd, () => {
		throw new Error('should not be invoked');
	});
	<span>{'Count: ' + p.label}</span>
}
export function DebugText() @{
	const dv = useDebugValue(123);
	<span>{'Type: ' + typeof dv}</span>
}

// ---- error recovery across renders ----
function Thrower() {
	throw new Error('boom');
}
export function ThrowingHooks() @{
	const [count] = useState(0);
	<div><Thrower />{'Count: ' + count}</div>
}
export function Good() @{ <span>ok</span> }

// ---- refs ----
export function RefCb(p) @{ <div id="r" ref={p.cb} /> }
export function PlainDiv() @{ <div id="r" /> }
function InnerRef(p) @{ <div id="fwd" ref={p.forwardedRef}>{p.value as string}</div> }
export function OuterRef(p) @{ <InnerRef forwardedRef={p.fwd} value={p.value} /> }

// ---- form hooks on the server ----
export function StatusText() @{
	const { pending } = useFormStatus();
	<span id="st">{'Pending: ' + pending}</span>
}
export function OptimisticText() @{
	const [optimisticState] = useOptimistic('hi');
	<span id="op">{optimisticState as string}</span>
}
export function ActionStateText(p) @{
	const [state] = useActionState(p.action, 0);
	<span id="as">{'State: ' + state}</span>
}
export function HydratedForm(p) @{
	<form action={p.action}>
		<input type="text" name="foo" value="bar" />
	</form>
}
`;

function evalMod(rt: any, opts: any): Record<string, any> {
	let { code } = compile(SRC, FILE, opts);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(rt, {});
}

const server = evalMod(ServerRT, { mode: 'server' });
const client = evalMod(ClientRT, { mode: 'client', dev: true });

const ssr = (name: string, props?: any) => ServerRT.renderToString(server[name], props).html;

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	errSpy.mockRestore();
});
const warns = () =>
	errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

function hydrate(name: string, props?: any) {
	const html = ssr(name, props);
	container.innerHTML = html;
	const before = container.innerHTML;
	hydrateRoot(container, client[name], props);
	flushSync(() => {});
	return { html, before, after: container.innerHTML };
}

// ===========================================================================
// ReactDOMServerIntegrationHooks-test.js — hooks render initial values
// ===========================================================================

describe('conformance: SSR server semantics — useState (Hooks)', () => {
	it('renders the initial state (Per ReactDOMServerIntegrationHooks-test.js:92)', () => {
		expect(ssr('StateText')).toContain('Count: 0');
	});

	it('runs a lazy state initializer once (Per :102)', () => {
		const onInit = vi.fn();
		expect(ssr('LazyState', { onInit })).toContain('Count: 0');
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it('does not re-render when an updater is invoked outside the render (Per :114)', () => {
		let capturedSet: any;
		const html = ssr('StateText', { captureSet: (s: any) => (capturedSet = s) });
		expect(html).toContain('Count: 0');
		// The server dispatch is inert — invoking it after the pass must neither
		// throw nor affect a subsequent render.
		expect(() => capturedSet(1)).not.toThrow();
		expect(ssr('StateText')).toContain('Count: 0');
	});

	// GAP: React's server renderer processes RENDER-PHASE state updates — a
	// `setCount` during render loops the component until it converges, so React
	// serializes 'Count: 3' (Hooks :156/:171; same family: useReducer render-phase
	// dispatch :234/:263). Octane's server useState returns a NOOP dispatch and a
	// render is strictly single-pass, so it serializes the initial 'Count: 0'.
	// Likely fix: a render-phase update loop in runtime.server.ts's useState/
	// useReducer + ssrComponent (re-invoke the body while dispatches fired).
	it.fails('re-renders on render-phase updates until settled (Per :156/:171)', () => {
		expect(ssr('RenderPhaseState')).toContain('Count: 3');
	});
});

describe('conformance: SSR server semantics — useReducer / useMemo / useRef (Hooks)', () => {
	it('renders useReducer initial state (Per :200)', () => {
		expect(ssr('ReducerText', { initial: 0 })).toContain('Count: 0');
	});

	it('runs useReducer lazy initialization (Per :217)', () => {
		const onInit = vi.fn();
		expect(ssr('LazyReducer', { initial: 10, onInit })).toContain('Count: 20');
		expect(onInit).toHaveBeenCalledWith(10);
	});

	it('renders the useMemo computed value (Per :320/:336)', () => {
		const onCompute = vi.fn();
		expect(ssr('MemoText', { text: 'hello', onCompute })).toContain('Value: HELLO');
		expect(onCompute).toHaveBeenCalledTimes(1);
	});

	it('renders useRef initial current (Per :458)', () => {
		expect(ssr('RefInitial')).toContain('Count: 0');
	});
});

describe('conformance: SSR server semantics — effects and handles do not run (Hooks)', () => {
	it('ignores useEffect/useLayoutEffect/useInsertionEffect on the server (Per :524/:625/:641)', () => {
		const onRun = vi.fn();
		expect(ssr('EffectsText', { onRun })).toContain('Count: 0');
		expect(onRun).not.toHaveBeenCalled();
	});

	it('does not invoke a useCallback-wrapped callback (Per :550)', () => {
		const callback = vi.fn();
		expect(ssr('CallbackText', { callback })).toContain('Type: function');
		expect(callback).not.toHaveBeenCalled();
	});

	it('supports render-time callbacks (Per :563)', () => {
		expect(ssr('RenderTimeCallback', { count: 2 })).toContain('Count: 5');
	});

	it('does not invoke useImperativeHandle on the server (Per :606)', () => {
		const fwd = { current: 0 };
		expect(ssr('ImperativeText', { fwd, label: 'Count' })).toContain('Count: Count');
		expect(fwd.current).toBe(0); // untouched
	});

	it('useDebugValue is a noop (Per :763)', () => {
		expect(ssr('DebugText')).toContain('Type: undefined');
	});
});

describe('conformance: SSR server semantics — render after a throw (Hooks)', () => {
	it('renders successfully after a component using hooks throws (Per :888)', () => {
		expect(() => ssr('ThrowingHooks')).toThrow('boom');
		// The failed pass must not corrupt renderer state for the next render.
		expect(ssr('Good')).toContain('ok');
	});
});

// ===========================================================================
// ReactDOMServerIntegrationRefs-test.js
// ===========================================================================

describe('conformance: SSR server semantics — refs (Refs)', () => {
	it('does not run ref code on the server (Per ReactDOMServerIntegrationRefs-test.js:41)', () => {
		let refCount = 0;
		const html = ssr('RefCb', { cb: () => refCount++ });
		// expectMarkupMatch(<RefsComponent/>, <div/>): the ref leaves no trace.
		expect(html).toBe(ssr('PlainDiv'));
		expect(refCount).toBe(0);
	});

	it('runs ref code on the client after hydration (Per :52)', () => {
		let refCount = 0;
		hydrate('RefCb', { cb: () => refCount++ });
		expect(refCount).toBe(1);
		expect(warns()).toEqual([]);
	});

	it('sends the adopted server element to ref functions on the client (Per :63)', () => {
		const html = ssr('RefCb', { cb: null });
		container.innerHTML = html;
		const serverEl = container.querySelector('#r');
		let refElement: any = null;
		hydrateRoot(container, client.RefCb, { cb: (e: any) => (refElement = e) });
		flushSync(() => {});
		expect(refElement).not.toBe(null);
		expect(refElement).toBe(serverEl); // the SAME adopted node, not a rebuild
	});

	it('forwards refs through component props (Per :76 — React-19 style, no forwardRef)', () => {
		const divRef: { current: any } = { current: null };
		hydrate('OuterRef', { fwd: divRef, value: 'hello' });
		expect(divRef.current).not.toBe(null);
		expect(divRef.current.textContent).toBe('hello');
		expect(warns()).toEqual([]);
	});
});

// ===========================================================================
// ReactDOMFizzForm-test.js — form hooks on the server (outcome level; the
// streaming machinery is out of scope, renderToString is octane's SSR pass)
// ===========================================================================

describe('conformance: SSR server semantics — form hooks (FizzForm)', () => {
	it('useFormStatus is not pending during server render (Per ReactDOMFizzForm-test.js:442)', () => {
		expect(ssr('StatusText')).toContain('Pending: false');
		// Hydration keeps the not-pending state with no mismatch.
		hydrate('StatusText');
		expect(warns()).toEqual([]);
		expect(container.querySelector('#st')!.textContent).toBe('Pending: false');
	});

	it('useOptimistic returns the passthrough value on the server (Per :531)', () => {
		expect(ssr('OptimisticText')).toContain('hi');
		hydrate('OptimisticText');
		expect(warns()).toEqual([]);
		expect(container.querySelector('#op')!.textContent).toBe('hi');
	});

	it('useActionState returns the initial state on the server (Per :549)', () => {
		const action = vi.fn(async (s: number) => s);
		expect(ssr('ActionStateText', { action })).toContain('State: 0');
		expect(action).not.toHaveBeenCalled();
		hydrate('ActionStateText', { action });
		expect(warns()).toEqual([]);
		expect(container.querySelector('#as')!.textContent).toBe('State: 0');
	});

	// Per :458 — outcome-level half. React REPLAYS a submit dispatched before
	// hydration; octane has no synthetic-event replay (documented divergence:
	// selective hydration is out of scope), so the pre-hydration submit is lost
	// and only post-hydration submits reach the function action.
	it('runs a function form action on submits after hydration (Per :458 — outcome level)', async () => {
		let foo: any = null;
		const action = (formData: FormData) => {
			foo = formData.get('foo');
		};
		const html = ssr('HydratedForm', { action });
		// The function action never serializes (Per :93 — see ssr.test.ts).
		expect(html).not.toContain('action');
		container.innerHTML = html;
		const form = container.querySelector('form') as HTMLFormElement;

		// Pre-hydration submit: no listener yet, nothing replays (divergence).
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		hydrateRoot(container, client.HydratedForm, { action });
		flushSync(() => {});
		expect(warns()).toEqual([]);
		expect(foo).toBe(null); // NOT replayed — octane divergence from Fizz

		// Post-hydration submit: intercepted, action gets the FormData.
		flushSync(() => {
			form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
		});
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(foo).toBe('bar');
	});
});
