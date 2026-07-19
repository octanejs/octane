const ERROR_DOCS_URL = 'https://octanejs.dev/errors/';
const UNPAIRED_SURROGATE = /[\uD800-\uDFFF]/gu;

function encodeErrorArgument(value: unknown): string {
	// encodeURIComponent rejects lone UTF-16 surrogates. Framework errors must
	// remain constructible even when a user-controlled key/name contains one;
	// preserve valid pairs and replace only malformed code units with U+FFFD.
	return encodeURIComponent(String(value).replace(UNPAIRED_SURROGATE, '\uFFFD'));
}

export function formatProdErrorMessage(code: number, args: readonly unknown[]): string {
	let url = ERROR_DOCS_URL + code;
	for (let i = 0; i < args.length; i++) {
		url += `${i === 0 ? '?' : '&'}args[]=${encodeErrorArgument(args[i])}`;
	}
	return (
		`Minified Octane error #${code}; visit ${url} for the full message ` +
		'or use a development build for full errors and additional helpful warnings.'
	);
}

export function formatDevErrorMessage(template: string, args: readonly unknown[]): string {
	let index = 0;
	return template.replace(/%s/g, () =>
		index < args.length ? String(args[index++]) : '[missing argument]',
	);
}

export function formatUnknownDevErrorMessage(code: number): string {
	return `Unknown Octane error code ${code}. The generated error catalog is stale.`;
}
