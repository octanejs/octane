// Vendored from react-router@8.2.0 packages/react-router/lib/router/url.ts — unmodified.
// Re-vendor with `node scripts/vendor-remix-router.mjs`; never hand-edit.
export const ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i;
export const PROTOCOL_RELATIVE_URL_REGEX = /^[\\/]{2}/;

export function normalizeProtocolRelativeUrl(url: string, protocol: string) {
	return protocol + url.replace(/\\/g, '/');
}
