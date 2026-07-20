import { useState, useCallback } from 'react';

type UseDeleteWithConfirmationOptions<TItem> = {
	/** Extract display name from item for confirmation message */
	getItemName: (item: TItem) => string;
	/** Function to perform the delete */
	deleteFn: (item: TItem) => Promise<void>;
	/** Label for the item type (e.g., "role", "banner") */
	itemLabel?: string;
	/** Callback after successful delete */
	onSuccess?: () => void;
	/** Callback on error (defaults to alert) */
	onError?: (error: Error, item: TItem) => void;
};

/**
 * Hook for delete operations with confirmation dialog.
 * Handles the confirm dialog, loading state, and error handling.
 *
 * @example
 * const { handleDelete, isDeleting } = useDeleteWithConfirmation({
 *   getItemName: (role) => role.name,
 *   deleteFn: async (role) => deleteRole.mutateAsync({ roleId: role._id }),
 *   itemLabel: 'role',
 * })
 */
export function useDeleteWithConfirmation<TItem>(options: UseDeleteWithConfirmationOptions<TItem>) {
	const [isDeleting, setIsDeleting] = useState(false);
	const [deletingItem, setDeletingItem] = useState<TItem | null>(null);

	const handleDelete = useCallback(
		async (item: TItem) => {
			const itemName = options.getItemName(item);
			const label = options.itemLabel || 'item';

			if (!window.confirm(`Are you sure you want to delete "${itemName}"?`)) {
				return;
			}

			setIsDeleting(true);
			setDeletingItem(item);
			try {
				await options.deleteFn(item);
				options.onSuccess?.();
			} catch (err) {
				const error = err instanceof Error ? err : new Error('Unknown error');
				console.error(`Failed to delete ${label}:`, error);
				if (options.onError) {
					options.onError(error, item);
				} else {
					alert(`Failed to delete ${label}: ${error.message}`);
				}
			} finally {
				setIsDeleting(false);
				setDeletingItem(null);
			}
		},
		[options],
	);

	return { handleDelete, isDeleting, deletingItem };
}
