// SelectionService — the inspect state machine, with no DOM and no rendering.
// One responsibility: track whether inspection is off / hovering / locked and
// which instance is selected, resolving elements through the registry. The
// inspector plugin owns the pointer/keyboard listeners and the overlay drawing;
// it drives this service and renders from its notifications. Keeping selection
// UI-free means the toolbar button, a keyboard shortcut, and a future
// command-palette can all move selection without duplicating logic.
import type { ComponentInstance, ComponentRegistry } from './registry.js';

export type SelectionMode = 'off' | 'hovering' | 'locked';

export interface Selection {
	readonly mode: SelectionMode;
	readonly instance: ComponentInstance | null;
}

export interface SelectionService {
	get(): Selection;
	/** Enter/leave inspect mode (drops any lock, clears hover). */
	setActive(active: boolean): void;
	toggle(): void;
	/** Hover-resolve an element (no-op unless in hovering mode). */
	hoverAt(element: Element | null): void;
	/** Lock onto the component owning an element. */
	lockAt(element: Element): void;
	subscribe(listener: (selection: Selection) => void): () => void;
}

export function createSelectionService(registry: ComponentRegistry): SelectionService {
	let mode: SelectionMode = 'off';
	let instance: ComponentInstance | null = null;
	const listeners = new Set<(selection: Selection) => void>();

	function emit(): void {
		const snapshot: Selection = { mode, instance };
		for (const listener of listeners) {
			try {
				listener(snapshot);
			} catch {
				// UI listeners must never break the app being scanned.
			}
		}
	}

	function set(nextMode: SelectionMode, nextInstance: ComponentInstance | null): void {
		if (nextMode === mode && nextInstance === instance) return;
		mode = nextMode;
		instance = nextInstance;
		emit();
	}

	return {
		get() {
			return { mode, instance };
		},
		setActive(active) {
			if (active) set('hovering', null);
			else set('off', null);
		},
		toggle() {
			this.setActive(mode === 'off');
		},
		hoverAt(element) {
			if (mode !== 'hovering') return;
			set('hovering', element === null ? null : registry.resolveByDom(element));
		},
		lockAt(element) {
			const found = registry.resolveByDom(element);
			if (found !== null) set('locked', found);
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
