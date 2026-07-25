/**
 * Compose the compiler's module-local head key with the existing root ID
 * namespace. Sibling hydrating roots already require distinct
 * `identifierPrefix` values; carrying that namespace into head ownership lets
 * them hydrate in any order without claiming another root's metadata.
 *
 * The optional hexadecimal root suffix is fixed-width and comment-safe. This
 * runs only for authored head entries (server serialization and the client's
 * one-time adoption), never on the ordinary component/host update path.
 */
export function headOwnershipSuffix(identifierPrefix: string): string {
	if (identifierPrefix === '') return '';
	let left = 0x811c9dc5;
	let right = 0x9e3779b9;
	for (let i = 0; i < identifierPrefix.length; i++) {
		const code = identifierPrefix.charCodeAt(i);
		left = Math.imul(left ^ code, 0x01000193);
		right = Math.imul(right ^ code, 0x85ebca6b);
		right = (right << 13) | (right >>> 19);
	}
	left ^= left >>> 16;
	left = Math.imul(left, 0x85ebca6b);
	left ^= left >>> 13;
	left = Math.imul(left, 0xc2b2ae35);
	left ^= left >>> 16;
	right ^= identifierPrefix.length;
	right ^= right >>> 16;
	right = Math.imul(right, 0x85ebca6b);
	right ^= right >>> 13;
	right = Math.imul(right, 0xc2b2ae35);
	right ^= right >>> 16;
	return (
		'-' + (left >>> 0).toString(16).padStart(8, '0') + (right >>> 0).toString(16).padStart(8, '0')
	);
}

export function headOwnershipKey(key: string, identifierPrefix: string): string {
	// Default-root metadata is already isolated by the module-aware compiler key.
	// Keep that overwhelmingly common path allocation-free.
	const suffix = headOwnershipSuffix(identifierPrefix);
	return suffix === '' ? key : key + suffix;
}
