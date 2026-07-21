// Bench delta: Sentry server helpers reduced to no-ops (observability, not
// app behavior). The export surface is preserved for any remaining importers.
export function initSentryServer(): void {}

export function captureException(error: unknown, _context?: unknown): void {
	console.error(error);
}

export function withSentrySpan<TResult>(
	_name: string,
	_op: string,
	fn: () => Promise<TResult> | TResult,
): Promise<TResult> | TResult {
	return fn();
}
