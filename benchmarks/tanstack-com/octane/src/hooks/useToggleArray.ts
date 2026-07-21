import { useState, useCallback } from 'octane';

/**
 * Hook for managing an array of items that can be toggled on/off.
 * Useful for multi-select checkboxes, capability lists, role assignments, etc.
 *
 * @example
 * const [selectedIds, toggleId, setSelectedIds] = useToggleArray<string>(['a', 'b'])
 * toggleId('c') // adds 'c'
 * toggleId('a') // removes 'a'
 */
export function useToggleArray<T>(
	initialValue: T[] = [],
): [T[], (item: T) => void, (items: T[]) => void] {
	const [items, setItems] = useState<T[]>(initialValue);

	const toggle = useCallback((item: T) => {
		setItems((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
	}, []);

	return [items, toggle, setItems];
}
