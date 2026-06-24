/**
 * Test helpers — thin wrapper around createRoot + flushSync so tests can
 * mount a component, inspect the DOM, fire events, and unmount cleanly.
 */
import {
	createRoot,
	flushSync,
	delegateEvents,
	drainPassiveEffects,
	act,
	type ComponentBody,
	type Root,
} from '../src/index.js';

export { act };

// Delegated events used by test fixtures. Setup-once.
delegateEvents(['click', 'input', 'change', 'keydown', 'submit']);

export interface MountResult {
	container: HTMLElement;
	root: Root;
	html(): string;
	unmount(): void;
	click(selector: string): void;
	find(selector: string): Element;
	findAll(selector: string): Element[];
	/** Re-render with new props (drains queued renders synchronously). */
	update<P>(body: ComponentBody<P>, props?: P): void;
}

export function mount<P = undefined>(body: ComponentBody<P>, props?: P): MountResult {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(body, props);
	flushSync(() => {});
	return {
		container,
		root,
		html() {
			return container.innerHTML;
		},
		unmount() {
			root.unmount();
			container.remove();
		},
		click(selector) {
			const el = container.querySelector(selector);
			if (!el) throw new Error(`no element matching ${selector}`);
			flushSync(() => {
				// HTMLElement has `.click()`. SVGElement / MathMLElement do NOT
				// (they're not in the HTMLElement prototype chain), so we dispatch
				// a bubbling click event explicitly — matches the real browser path
				// the runtime listens on at the delegation root.
				if (typeof (el as HTMLElement).click === 'function') {
					(el as HTMLElement).click();
				} else {
					el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
				}
			});
		},
		find(selector) {
			const el = container.querySelector(selector);
			if (!el) throw new Error(`no element matching ${selector}`);
			return el;
		},
		findAll(selector) {
			return Array.from(container.querySelectorAll(selector));
		},
		update(body, props) {
			flushSync(() => root.render(body, props));
		},
	};
}

/**
 * Synchronously drain any pending useEffect (passive) bodies. Deterministic —
 * doesn't rely on happy-dom's rAF/setTimeout fidelity. Use instead of waiting
 * for real paint cycles.
 */
export function flushEffects(): void {
	drainPassiveEffects();
}

/** Older name kept for tests that read more naturally with it. */
export function nextPaint(): Promise<void> {
	drainPassiveEffects();
	return Promise.resolve();
}

/**
 * Ordered side-effect log — the standard substitute for React reconciler tests
 * that assert `Scheduler.log([...])` of yields/effects. A fixture pushes labels
 * from render / effects / cleanups (pass `log.push` down as a prop), and the
 * test asserts `log.drain()` after each `act()` / `flushSync` boundary.
 *
 *   const log = createLog();
 *   const r = mount(Fixture, { log: log.push });
 *   await act(() => {});
 *   expect(log.drain()).toEqual(['mount A', 'mount B']);
 */
export interface EffectLog {
	/** Append an entry. Bind this and hand it to fixtures. */
	push: (entry: string) => void;
	/** The live backing array (read-only view of what's accumulated). */
	entries: readonly string[];
	/** Return everything logged since the last drain, then clear. */
	drain: () => string[];
	/** Discard everything without returning it. */
	clear: () => void;
}

export function createLog(): EffectLog {
	const entries: string[] = [];
	return {
		entries,
		push: (entry: string) => {
			entries.push(entry);
		},
		drain: () => entries.splice(0, entries.length),
		clear: () => {
			entries.length = 0;
		},
	};
}
