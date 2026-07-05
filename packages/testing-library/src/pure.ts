/**
 * @octanejs/testing-library — the side-effect-free core (`…/pure` entry).
 *
 * Strategy (docs/react-library-compat-plan.md §2): `@testing-library/dom` is
 * framework-agnostic, so it is depended on VERBATIM and re-exported wholesale
 * (queries, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, …). Only
 * react-testing-library's thin React layer is ported here, onto octane:
 *
 *  - `render` / `cleanup` / `renderHook` mount through octane's `createRoot`
 *    (or `hydrateRoot`) and commit synchronously via `flushSync` + a passive-
 *    effect drain — the observable equivalent of RTL wrapping every render in
 *    a synchronous React `act()`.
 *  - dom-testing-library's config hooks are wired to octane's commit machinery
 *    (`eventWrapper` → flushSync, `asyncWrapper` → act-environment suspension,
 *    `unstable_advanceTimersWrapper` → octane `act`) exactly where RTL wires
 *    them to React's act-compat.
 *
 * Octane-specific surface (documented in the README): components in plain-`.ts`
 * tests are values, not JSX — so `render` accepts BOTH an element descriptor
 * (`render(createElement(App, {x: 1}))`) and the bare component + a `props`
 * render-option (`render(App, {props: {x: 1}})`).
 */
import {
	act,
	createElement,
	createRoot,
	drainPassiveEffects,
	flushSync,
	hasPendingWork,
	hydrateRoot,
	isValidElement,
	useEffect,
	withSlot,
	type ComponentBody,
	type ElementDescriptor,
	type Root,
} from 'octane';
import {
	configure as configureDTL,
	getQueriesForElement,
	prettyDOM,
	queries as defaultQueries,
} from '@testing-library/dom';
import type { BoundFunctions, Queries } from '@testing-library/dom';
import { getIsOctaneActEnvironment, setOctaneActEnvironment } from './act-environment';

// ─────────────────────────────────────────────────────────────────────────────
// dom-testing-library config wiring (RTL pure.js does the same three hooks).
// ─────────────────────────────────────────────────────────────────────────────

// vitest/sinon fake timers stamp a `clock` property on the mocked setTimeout;
// jest's legacy timer mocks stamp `_isMockFunction` (the same two probes RTL
// ships). Used to avoid parking `asyncWrapper` on a macrotask that a fake
// clock would never fire.
function fakeTimersAreEnabled(): boolean {
	const st = setTimeout as unknown as { _isMockFunction?: boolean };
	return st._isMockFunction === true || Object.prototype.hasOwnProperty.call(setTimeout, 'clock');
}

configureDTL({
	// `waitFor` with fake timers advances the clock through this wrapper; octane's
	// act() drains the renders/effects each advancement schedules.
	unstable_advanceTimersWrapper: (cb) => act(cb as () => unknown),
	// `waitFor`/`findBy*` bodies await work that legitimately updates state outside
	// an act() scope — suspend the "not wrapped in act(...)" warning for the
	// duration (RTL does the same around IS_REACT_ACT_ENVIRONMENT).
	asyncWrapper: async (cb) => {
		const previousActEnvironment = getIsOctaneActEnvironment();
		setOctaneActEnvironment(false);
		try {
			const result = await cb();
			// Let in-flight promise reactions land before the act environment is
			// restored (RTL's 0ms settle). Octane flushes scheduled renders on
			// microtasks, so under a fake clock — where a real 0ms timer would never
			// fire and library code has no handle to advance vitest's clock (unlike
			// jest's global) — a drained microtask queue is already quiescent.
			await new Promise<void>((resolve) => {
				if (fakeTimersAreEnabled()) {
					void Promise.resolve().then(() => resolve());
				} else {
					setTimeout(() => resolve(), 0);
				}
			});
			settleSync();
			return result;
		} finally {
			setOctaneActEnvironment(previousActEnvironment);
		}
	},
	// Every `fireEvent` dispatch runs through here. Octane's DISCRETE delegated
	// events (click/input/keydown/…) already commit synchronously on their own
	// (maybeFlushDiscrete → flushSync), but fireEvent also dispatches event types
	// with no discrete path — non-delegated or programmatic events whose updates
	// would otherwise sit queued until the next microtask, i.e. after the test's
	// assertion. flushSync commits those too, and the passive drain mirrors RTL's
	// act(): effects scheduled by the event have run before fireEvent returns.
	eventWrapper: (cb) => {
		let result: unknown;
		flushSync(() => {
			result = cb();
		});
		settleSync();
		return result;
	},
});

// ─────────────────────────────────────────────────────────────────────────────
// Mounted-root bookkeeping (RTL pure.js's mountedContainers/mountedRootEntries):
// a Set for the constant-time "new container?" check, an array for cleanup().
// ─────────────────────────────────────────────────────────────────────────────

interface RootEntry {
	container: Element;
	root: Root;
}
const mountedContainers = new Set<Element>();
const mountedRootEntries: RootEntry[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// UI normalization — octane's two authoring forms into one mountable element.
// ─────────────────────────────────────────────────────────────────────────────

/** What `render`/`rerender` accept: a component body, or a `createElement` result. */
export type OctaneUI<P = any> = ComponentBody<P> | ElementDescriptor<P>;

// A root can only mount a COMPONENT. `render(createElement('div', …))` (RTL's
// `render(<div/>)`) produces a HOST descriptor, so it is returned from a pass-
// through component and rendered by the runtime's value-position renderer.
function ValueRoot(props: { children: unknown }): unknown {
	return props.children;
}

function toElement<P>(ui: OctaneUI<P>, props: P | undefined): ElementDescriptor {
	if (isValidElement(ui)) {
		if (props !== undefined) {
			throw new Error(
				'render/rerender received both an element descriptor and `props` — ' +
					'pass props through createElement(Component, props), or pass the bare component.',
			);
		}
		return ui;
	}
	if (typeof ui !== 'function') {
		throw new Error(
			'render/rerender expects an octane component (a function) or an element ' +
				`descriptor from createElement(...); received ${typeof ui}.`,
		);
	}
	return createElement(ui, props);
}

function wrapUiIfNeeded(
	element: ElementDescriptor,
	wrapperComponent: ComponentBody<{ children: any }> | undefined,
): ElementDescriptor {
	return wrapperComponent ? createElement(wrapperComponent, { children: element }) : element;
}

function mountable(element: ElementDescriptor): ElementDescriptor {
	return typeof element.type === 'string'
		? createElement(ValueRoot, { children: element })
		: element;
}

// Drain render ⇄ passive-effect cascades to quiescence, SYNCHRONOUSLY: each
// round runs queued useEffect bodies (which may setState) and then commits the
// renders they scheduled (flushSync also runs layout-effect cascades, queuing
// the next round's passives). This is the observable behavior of RTL wrapping
// work in a sync React `act()`. Loops on octane's scheduler-quiescence probe
// (`hasPendingWork`) for an EXACT settle; the round cap only guards against a
// pathological unbounded effect→setState cycle (which octane's own
// "Too many re-renders" guard would surface anyway). Purely promise-driven work
// (use(promise), transitions) can never settle synchronously — that's what
// `waitFor`/`findBy*`/`act` are for, same as RTL.
function settleSync(): void {
	for (let i = 0; i < 50 && hasPendingWork(); i++) {
		drainPassiveEffects();
		flushSync(() => {});
	}
}

// Commit a render synchronously — flushSync for the render itself, then the
// cascade settle. Equivalent to RTL's `act(() => root.render(ui))` (sync form).
function commitRender(root: Root, element: ElementDescriptor): void {
	flushSync(() => {
		root.render(element);
	});
	settleSync();
}

// ─────────────────────────────────────────────────────────────────────────────
// render()
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderOptions<P = any> {
	/** Element the UI mounts into. Defaults to a fresh <div> appended to baseElement. */
	container?: HTMLElement;
	/** Element the returned queries are bound to. Defaults to `container` or document.body. */
	baseElement?: HTMLElement;
	/** Adopt server-rendered DOM already inside `container` via octane's hydrateRoot. */
	hydrate?: boolean;
	/** Custom dom-testing-library queries (untyped passthrough; result is typed for the defaults). */
	queries?: Queries;
	/** Component rendered around the UI — must render `{props.children}` (providers etc.). */
	wrapper?: ComponentBody<{ children: any }>;
	/**
	 * Octane extension: props for the `render(Component, {props})` form — in
	 * plain-`.ts` tests a component is a VALUE, so this replaces JSX's inline
	 * props. Ignored (an error) when `ui` is already an element descriptor.
	 */
	props?: P;
}

export type DebugFn = (
	el?: Element | DocumentFragment | Array<Element | DocumentFragment>,
	maxLength?: number,
	options?: Parameters<typeof prettyDOM>[2],
) => void;

export type RenderResult = {
	container: HTMLElement;
	baseElement: HTMLElement;
	debug: DebugFn;
	/** Re-render (same component ⇒ props update in place, like RTL's rerender). */
	rerender: (ui: OctaneUI, props?: any) => void;
	unmount: () => void;
	asFragment: () => DocumentFragment;
} & BoundFunctions<typeof defaultQueries>;

export function render<P = any>(ui: OctaneUI<P>, options: RenderOptions<P> = {}): RenderResult {
	const { hydrate = false, props, queries, wrapper: WrapperComponent } = options;
	let { baseElement, container } = options;

	if (!baseElement) {
		// Default to document.body (not documentElement) — matches RTL, keeps
		// debug output free of <head> noise.
		baseElement = options.container ?? document.body;
	}
	if (!container) {
		container = baseElement.appendChild(document.createElement('div'));
	}

	const element = mountable(wrapUiIfNeeded(toElement(ui, props), WrapperComponent));

	let root: Root;
	if (!mountedContainers.has(container)) {
		if (hydrate) {
			// hydrateRoot adopts the server DOM during creation (it renders once,
			// synchronously) — only the effect settle is left to do.
			root = hydrateRoot(container, element);
			settleSync();
		} else {
			root = createRoot(container);
			commitRender(root, element);
		}
		mountedRootEntries.push({ container, root });
		// Track the container regardless of whether WE created it, so cleanup()
		// handles caller-supplied containers too (RTL does the same).
		mountedContainers.add(container);
	} else {
		// Same container rendered again → reuse its root (same component updates
		// props in place; a different component tears down and remounts).
		root = mountedRootEntries.find((entry) => entry.container === container)!.root;
		commitRender(root, element);
	}

	return {
		container,
		baseElement,
		// prettyDOM handles DocumentFragments at runtime; its published type only
		// admits Element, hence the casts.
		debug: (el = baseElement, maxLength, debugOptions) =>
			Array.isArray(el)
				? // eslint-disable-next-line no-console
					el.forEach((e) => console.log(prettyDOM(e as Element, maxLength, debugOptions)))
				: // eslint-disable-next-line no-console
					console.log(prettyDOM(el as Element, maxLength, debugOptions)),
		unmount: () => {
			flushSync(() => {
				root.unmount();
			});
		},
		rerender: (rerenderUi: OctaneUI, rerenderProps?: any) => {
			// The wrapper is re-applied so component identity is stable across
			// rerenders (same body ⇒ octane updates props in place).
			commitRender(
				root,
				mountable(wrapUiIfNeeded(toElement(rerenderUi, rerenderProps), WrapperComponent)),
			);
		},
		asFragment: () => document.createRange().createContextualFragment(container.innerHTML),
		...(getQueriesForElement(baseElement, queries as any) as BoundFunctions<typeof defaultQueries>),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// cleanup()
// ─────────────────────────────────────────────────────────────────────────────

export function cleanup(): void {
	for (const { root, container } of mountedRootEntries) {
		flushSync(() => {
			root.unmount();
		});
		if (container.parentNode === document.body) {
			document.body.removeChild(container);
		}
	}
	mountedRootEntries.length = 0;
	mountedContainers.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// renderHook()
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderHookOptions<Props> extends Omit<RenderOptions, 'props'> {
	/** Props passed to the hook callback on the first render. */
	initialProps?: Props;
}

export interface RenderHookResult<Result, Props> {
	/** Latest COMMITTED hook result (recorded from an effect, like RTL). */
	result: { current: Result };
	rerender: (props?: Props) => void;
	unmount: () => void;
}

// The harness component below is plain `.ts`, so its own hooks take EXPLICIT
// slot symbols (this package is excluded from the compiler's auto-slotting
// pass; published node_modules are skipped by it anyway). Hook state is keyed
// per (component scope, slot), so module-level symbols are safe across
// concurrently mounted harnesses.
const HOOK_PATH_SLOT = Symbol.for('@octanejs/testing-library:renderHook/callback');
const RECORD_EFFECT_SLOT = Symbol.for('@octanejs/testing-library:renderHook/record');

export function renderHook<Result, Props = undefined>(
	renderCallback: (props: Props) => Result,
	options: RenderHookOptions<Props> = {},
): RenderHookResult<Result, Props> {
	const { initialProps, ...renderOptions } = options;
	const result: { current: Result } = { current: undefined as never };

	// Defined per renderHook call (RTL does the same) so each invocation gets a
	// distinct component identity, while rerenders of THIS invocation keep it.
	function TestComponent(props: { renderCallbackProps: Props }) {
		// withSlot pushes a call-site path for the callback's duration: a slotless
		// custom hook reached from here (one the compiler never saw — e.g. a
		// binding hook called directly in a plain-`.ts` test) still resolves a
		// hook identity, and the trailing symbol serves bindings that read their
		// slot off the last argument. Compiled callbacks are unaffected — their
		// explicit per-call-site slots fold into the path deterministically.
		// (A slotless callback calling TWO+ base hooks directly still needs the
		// compiler or explicit symbols — the path alone can't tell them apart.)
		const pendingResult = withSlot(
			HOOK_PATH_SLOT,
			renderCallback as (...args: any[]) => Result,
			props.renderCallbackProps,
			HOOK_PATH_SLOT,
		);
		// Record on COMMIT (RTL records from useEffect): a render that throws
		// never publishes a result.
		useEffect(
			() => {
				result.current = pendingResult;
			},
			undefined,
			RECORD_EFFECT_SLOT,
		);
		return null;
	}

	const { rerender: baseRerender, unmount } = render(TestComponent, {
		...renderOptions,
		props: { renderCallbackProps: initialProps as Props },
	});

	return {
		result,
		rerender: (rerenderCallbackProps?: Props) =>
			baseRerender(TestComponent, { renderCallbackProps: rerenderCallbackProps as Props }),
		unmount,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports — everything dom-testing-library ships, plus the octane layer.
// `fireEvent` is dom-testing-library's own (see fire-event.ts for why there is
// deliberately NO react-testing-library-style event remapping on top).
// ─────────────────────────────────────────────────────────────────────────────

export * from '@testing-library/dom';
export { fireEvent } from './fire-event';
export { act } from 'octane';
