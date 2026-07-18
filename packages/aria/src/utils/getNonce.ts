// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/getNonce.ts).
// octane adaptation: the `globalThis.__webpack_nonce__` read goes through the NonceWindow cast
// (TS's `globalThis` has no index signature).

import { getOwnerWindow } from './domHelpers';

type NonceWindow = Window &
	typeof globalThis & {
		__webpack_nonce__?: string;
	};

function getWebpackNonce(doc?: Document): string | undefined {
	let ownerWindow = doc?.defaultView as NonceWindow | null | undefined;
	return (
		ownerWindow?.__webpack_nonce__ || (globalThis as NonceWindow).__webpack_nonce__ || undefined
	);
}

let nonceCache = new WeakMap<Document, string>();

/** Reset the cached nonce value. Exported for testing only. */
export function resetNonceCache(): void {
	nonceCache = new WeakMap();
}

/**
 * Returns the CSP nonce, if configured via a `<meta property="csp-nonce">` tag or
 * `__webpack_nonce__`. This allows dynamically injected `<style>` elements to work with Content
 * Security Policy.
 */
export function getNonce(doc?: Document): string | undefined {
	let d = doc ?? (typeof document !== 'undefined' ? document : undefined);
	if (!d) {
		return getWebpackNonce(d);
	}

	if (nonceCache.has(d)) {
		return nonceCache.get(d);
	}

	let meta = d.querySelector('meta[property="csp-nonce"]');
	let nonce =
		(meta &&
			meta instanceof getOwnerWindow(meta).HTMLMetaElement &&
			(meta.nonce || meta.content)) ||
		getWebpackNonce(d) ||
		undefined;

	if (nonce !== undefined) {
		nonceCache.set(d, nonce);
	}
	return nonce;
}
