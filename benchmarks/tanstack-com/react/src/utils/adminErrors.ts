/**
 * Standardized error handling for admin operations.
 * Logs the error and optionally shows an alert.
 *
 * @example
 * try {
 *   await deleteRole.mutateAsync({ roleId })
 * } catch (error) {
 *   handleAdminError(error, 'Failed to delete role')
 * }
 */
export function handleAdminError(
	error: unknown,
	context: string,
	options?: { silent?: boolean },
): string {
	const message = error instanceof Error ? error.message : 'Unknown error';
	console.error(`${context}:`, error);
	if (!options?.silent) {
		alert(`${context}: ${message}`);
	}
	return message;
}

/**
 * Extracts error message from unknown error type.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'Unknown error';
}
