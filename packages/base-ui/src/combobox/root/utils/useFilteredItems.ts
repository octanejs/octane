/** @jsxImportSource octane */
import { useComboboxDerivedItemsContext } from '../ComboboxRootContext.tsrx';

/**
 * Returns the internally filtered items.
 * Treat the result as read-only: it is internal state and may be a shared frozen array.
 */
export function useFilteredItems<T>() {
	const items = useComboboxDerivedItemsContext();
	return items.filteredItems as T[];
}
