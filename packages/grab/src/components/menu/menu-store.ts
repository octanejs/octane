import { createMenuHighlight } from '../../utils/create-menu-highlight.js';
import type { MenuItemRegistration, MenuStore } from './menu-context.js';

interface CreateMenuStoreOptions {
	keyboardNavigation?: boolean;
	clearActiveOnPointerLeave?: boolean;
	// When set, hover only activates a row after the pointer has actually
	// moved over the menu. Guards against a stationary cursor firing a
	// phantom pointerenter (and yanking the active row) when the list mounts
	// or repositions under it.
	requirePointerMove?: boolean;
	// Controlled mode (cmdk-style): when a controlled value is used the active
	// row is owned by the parent and every activation is reported through
	// `onValueChange` instead of mutating internal state. Pass the initial value
	// here and push subsequent updates through `store.setControlledValue`.
	value?: string | null;
	onValueChange?: (value: string | null) => void;
	highlight?: {
		topCornerRadiusPx?: number;
		bottomCornerRadiusPx?: number;
		cornerShape?: string;
	};
}

export const createMenuStore = (options: CreateMenuStoreOptions = {}): MenuStore => {
	const itemsByValue = new Map<string, MenuItemRegistration>();
	const orderedValues: string[] = [];
	const idPrefix = `react-grab-menu-${Math.random().toString(36).slice(2, 8)}`;
	let idCounter = 0;
	let didPointerMove = false;

	const isControlled = options.value !== undefined || options.onValueChange !== undefined;
	let internalActiveValue: string | null = null;
	let controlledValue: string | null = options.value ?? null;

	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of [...listeners]) listener();
	};

	const highlight = createMenuHighlight(options.highlight ?? {});

	const activeValue = (): string | null => (isControlled ? controlledValue : internalActiveValue);

	// Imperative replacement for the former `createEffect(on([activeValue,
	// registryVersion]))`: sync the visible highlight to whatever row is active
	// whenever the active value or the registry changes.
	const syncHighlight = (): void => {
		const value = activeValue();
		if (value === null) {
			highlight.clearHighlight();
			return;
		}
		const registration = itemsByValue.get(value);
		if (registration) {
			highlight.updateHighlight(registration.element);
		} else {
			highlight.clearHighlight();
		}
	};

	const setActiveItem = (value: string | null): void => {
		if (isControlled) {
			options.onValueChange?.(value);
			return;
		}
		if (internalActiveValue === value) return;
		internalActiveValue = value;
		syncHighlight();
		notify();
	};

	const setControlledValue = (value: string | null): void => {
		if (controlledValue === value) return;
		controlledValue = value;
		syncHighlight();
		notify();
	};

	const enabledValues = (): string[] =>
		orderedValues.filter((value) => itemsByValue.get(value)?.isEnabled());

	const selectFirst = (): void => {
		const candidates = enabledValues();
		if (candidates.length > 0) setActiveItem(candidates[0]);
	};

	const selectLast = (): void => {
		const candidates = enabledValues();
		if (candidates.length > 0) setActiveItem(candidates[candidates.length - 1]);
	};

	const selectNext = (): void => {
		const candidates = enabledValues();
		if (candidates.length === 0) return;
		const currentIndex = candidates.indexOf(activeValue() ?? '');
		const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % candidates.length;
		setActiveItem(candidates[nextIndex]);
	};

	const selectPrevious = (): void => {
		const candidates = enabledValues();
		if (candidates.length === 0) return;
		const currentIndex = candidates.indexOf(activeValue() ?? '');
		const previousIndex =
			currentIndex === -1
				? candidates.length - 1
				: (currentIndex - 1 + candidates.length) % candidates.length;
		setActiveItem(candidates[previousIndex]);
	};

	const activeDescendantId = (): string | undefined => {
		const value = activeValue();
		if (value === null) return undefined;
		return itemsByValue.get(value)?.domId;
	};

	return {
		keyboardNavigation: options.keyboardNavigation ?? false,
		clearActiveOnPointerLeave: options.clearActiveOnPointerLeave ?? false,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		activeValue,
		activeDescendantId,
		setActiveItem,
		setControlledValue,
		createItemId: () => `${idPrefix}-item-${idCounter++}`,
		canActivateOnHover: () => !(options.requirePointerMove ?? false) || didPointerMove,
		notePointerMove: () => {
			didPointerMove = true;
		},
		resetPointerMove: () => {
			didPointerMove = false;
		},
		registerItem: (registration) => {
			itemsByValue.set(registration.value, registration);
			if (!orderedValues.includes(registration.value)) orderedValues.push(registration.value);
			syncHighlight();
			notify();
		},
		unregisterItem: (value) => {
			itemsByValue.delete(value);
			const orderIndex = orderedValues.indexOf(value);
			if (orderIndex !== -1) orderedValues.splice(orderIndex, 1);
			if (!isControlled && internalActiveValue === value) {
				internalActiveValue = null;
			}
			syncHighlight();
			notify();
		},
		getActiveItem: () => {
			const value = activeValue();
			return value === null ? undefined : itemsByValue.get(value);
		},
		selectFirst,
		selectLast,
		selectNext,
		selectPrevious,
		setHighlightContainer: highlight.containerRef,
		setHighlightRail: highlight.highlightRef,
		dispose: () => highlight.dispose(),
	};
};
