/**
 * The production message of an error that takes no arguments. The published
 * build rewrites each module whose errors all take none to import this
 * (scripts/specialize-error-calls.mjs), so those modules share one copy of the
 * text instead of carrying one each, and need neither the generic formatter
 * nor its argument encoder. Matches formatProdErrorMessage(code, []).
 */
export function formatNoArgumentErrorMessage(code: number): string {
	return (
		`Minified Octane error #${code}; visit https://octanejs.dev/errors/${code} for the full message ` +
		'or use a development build for full errors and additional helpful warnings.'
	);
}
