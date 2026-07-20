import { useState, useCallback } from 'react';

type UseInlineEditOptions<TItem, TEditState> = {
	/** Extract initial edit state from the item being edited */
	getInitialState: (item: TItem) => TEditState;
	/** Get empty state (for when nothing is being edited) */
	getEmptyState: () => TEditState;
	/** Function to save the edited state */
	saveFn: (itemId: string, state: TEditState) => Promise<void>;
	/** Extract ID from item */
	getId: (item: TItem) => string;
	/** Label for error messages */
	itemLabel?: string;
	/** Callback on error */
	onError?: (error: Error) => void;
};

/**
 * Hook for inline edit/save/cancel state management.
 * Handles tracking which item is being edited, the edit state, and save/cancel actions.
 *
 * @example
 * const {
 *   editingId,
 *   editState,
 *   isEditing,
 *   startEdit,
 *   cancelEdit,
 *   save,
 *   updateField,
 * } = useInlineEdit({
 *   getInitialState: (role) => ({
 *     name: role.name,
 *     description: role.description || '',
 *     capabilities: role.capabilities,
 *   }),
 *   getEmptyState: () => ({ name: '', description: '', capabilities: [] }),
 *   saveFn: async (id, state) => updateRole.mutateAsync({ roleId: id, ...state }),
 *   getId: (role) => role._id,
 * })
 */
export function useInlineEdit<TItem, TEditState extends Record<string, unknown>>(
	options: UseInlineEditOptions<TItem, TEditState>,
) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editState, setEditState] = useState<TEditState>(options.getEmptyState());
	const [isSaving, setIsSaving] = useState(false);

	const startEdit = useCallback(
		(item: TItem) => {
			setEditingId(options.getId(item));
			setEditState(options.getInitialState(item));
		},
		[options],
	);

	const cancelEdit = useCallback(() => {
		setEditingId(null);
		setEditState(options.getEmptyState());
	}, [options]);

	const save = useCallback(async () => {
		if (!editingId) return;

		setIsSaving(true);
		try {
			await options.saveFn(editingId, editState);
			cancelEdit();
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error');
			const label = options.itemLabel || 'item';
			console.error(`Failed to save ${label}:`, error);
			if (options.onError) {
				options.onError(error);
			} else {
				alert(`Failed to save ${label}: ${error.message}`);
			}
		} finally {
			setIsSaving(false);
		}
	}, [editingId, editState, options, cancelEdit]);

	const updateField = useCallback(<K extends keyof TEditState>(field: K, value: TEditState[K]) => {
		setEditState((prev) => ({ ...prev, [field]: value }));
	}, []);

	const isEditing = useCallback(
		(item: TItem) => editingId === options.getId(item),
		[editingId, options],
	);

	return {
		editingId,
		editState,
		isSaving,
		isEditing,
		startEdit,
		cancelEdit,
		save,
		updateField,
		setEditState,
	};
}
