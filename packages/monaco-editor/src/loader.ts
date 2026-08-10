export function isLoaderCancelation(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && 'type' in error && error.type === 'cancelation'
	);
}
