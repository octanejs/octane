export function isDataURI(value: unknown): value is string {
	return typeof value === 'string' && /^data:/.test(value);
}

export function dataURItoByteString(uri: string): string {
	if (!isDataURI(uri)) throw new Error('Invalid data URI.');
	const comma = uri.indexOf(',');
	if (comma < 0) throw new Error('Invalid data URI.');
	const metadata = uri.slice(0, comma);
	const payload = uri.slice(comma + 1);
	return metadata.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
}

export function dataURItoBytes(uri: string): Uint8Array {
	return Uint8Array.from(dataURItoByteString(uri), (character) => character.charCodeAt(0));
}

export function convertDataUriParameterObject<T extends { url: string }>(
	file: T,
): Omit<T, 'url'> & { data: Uint8Array } {
	const { url, ...otherParams } = file;
	return { data: dataURItoBytes(url), ...otherParams };
}

export function isProvided<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
