/**
 * Tiny client/server streaming protocol subset shared with the lightweight
 * pre-root hydration event capture. Keep this module dependency-free: loading
 * interaction capture before the main runtime must not initialize DOM tables.
 */

/** Sentinel <template> attribute marking a pending streamed boundary. */
export const STREAM_BOUNDARY_ATTR = 'data-oct-b';

/** Render-unique token stamped on deferred-hydration owners in a streamed shell. */
export const HYDRATE_STREAM_TOKEN_ATTR = 'data-octane-stream-token';

function hydrationMarkerMultiplicity(data: string, open: boolean): number {
	const marker = open ? '[' : ']';
	if (data === marker) return 1;
	if (open && (data === '[f0' || data === '[f1')) return 1;
	if (data.length < 2 || data.charCodeAt(0) !== marker.charCodeAt(0)) return 0;
	const first = data.charCodeAt(1);
	if (first < 49 || first > 57) return 0;
	let value = first - 48;
	for (let i = 2; i < data.length; i++) {
		const digit = data.charCodeAt(i) - 48;
		if (digit < 0 || digit > 9) return 0;
		value = value * 10 + digit;
		if (!Number.isSafeInteger(value)) return 0;
	}
	return value >= 2 ? value : 0;
}

function isHydrationOpen(node: Node | null): node is Comment {
	return (
		node !== null &&
		node.nodeType === 8 &&
		hydrationMarkerMultiplicity((node as Comment).data, true) !== 0
	);
}

/** Find a physical hydration range's close without trusting malformed comment input. */
export function rendererRangeClose(open: Node | null): Comment | null {
	if (!isHydrationOpen(open)) return null;
	let depth = 0;
	let node = open.nextSibling;
	while (node !== null) {
		if (node.nodeType === 8) {
			const data = (node as Comment).data;
			if (hydrationMarkerMultiplicity(data, true) !== 0) {
				depth++;
			} else if (hydrationMarkerMultiplicity(data, false) !== 0) {
				if (depth === 0) return node as Comment;
				depth--;
			}
		}
		node = node.nextSibling;
	}
	return null;
}

/** True for the opaque per-render token minted by the server streamer. */
export function isRendererStreamToken(token: string | null): token is string {
	return token !== null && /^os[a-zA-Z0-9_-]+-[0-9a-z]+$/.test(token);
}

/** Extract the render token from a canonical streamed-boundary id. */
export function streamTokenFromBoundaryId(id: string | null): string | null {
	if (id === null) return null;
	const separator = id.lastIndexOf('-');
	if (separator <= 2 || separator === id.length - 1) return null;
	const token = id.slice(0, separator);
	const order = id.slice(separator + 1);
	if (!isRendererStreamToken(token)) return null;
	if (!/^(?:0|[1-9a-z][0-9a-z]*)$/.test(order)) return null;
	return token;
}

/**
 * Recognize a renderer sentinel only when its opaque id belongs to the expected
 * stream and it occupies the exact leading position of a balanced SSR range.
 */
export function isRendererStreamBoundaryTemplate(
	node: Element,
	expectedToken?: string | null,
): boolean {
	if (node.localName !== 'template') return false;
	const id = node.getAttribute(STREAM_BOUNDARY_ATTR);
	const token = streamTokenFromBoundaryId(id);
	if (token === null || (expectedToken !== undefined && token !== expectedToken)) return false;
	const open = node.previousSibling;
	return isHydrationOpen(open) && open.nextSibling === node && rendererRangeClose(open) !== null;
}
