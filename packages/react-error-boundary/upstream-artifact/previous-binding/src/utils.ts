export function getErrorMessage(thrown: unknown): string | undefined {
	if (typeof thrown === 'string') return thrown;
	if (
		thrown !== null &&
		typeof thrown === 'object' &&
		'message' in thrown &&
		typeof thrown.message === 'string'
	) {
		return thrown.message;
	}
	return undefined;
}
