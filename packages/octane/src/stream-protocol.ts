/**
 * Tiny client/server streaming protocol subset shared with the lightweight
 * pre-root hydration event capture. Keep this graph renderer-free: loading
 * interaction capture before the main runtime must not initialize DOM tables.
 */
import {
	BINDING_OPEN_PREFIX,
	isBindingOpenComment,
	isForBindingOpenComment,
} from './dom-binding-protocol.js';
import {
	HYDRATION_END,
	HYDRATION_FOR_EMPTY,
	HYDRATION_FOR_ITEMS,
	HYDRATION_FOR_PREFIX,
	HYDRATION_START,
} from './hydration-markers.js';

/** Sentinel <template> attribute marking a pending streamed boundary. */
export const STREAM_BOUNDARY_ATTR = 'data-oct-b';

/** Renderer-owned JSON script carrying resolved SSR Suspense values. */
export const SUSPENSE_SCRIPT_ATTR = 'data-octane-suspense';

/** Renderer-owned executable/data scripts emitted by the streaming protocol. */
export const STREAM_SCRIPT_ATTR = 'data-octane-stream';

/** Render-unique token stamped on deferred-hydration owners in a streamed shell. */
export const HYDRATE_STREAM_TOKEN_ATTR = 'data-octane-stream-token';

function hydrationMarkerMultiplicity(data: string, open: boolean): number {
	const marker = open ? HYDRATION_START : HYDRATION_END;
	if (data === marker) return 1;
	if (open && (data === HYDRATION_FOR_EMPTY || data === HYDRATION_FOR_ITEMS)) return 1;
	if (
		open &&
		(data.startsWith(BINDING_OPEN_PREFIX) || data.startsWith(HYDRATION_FOR_PREFIX)) &&
		isBindingOpenComment(data)
	)
		return 1;
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

/** Existing physical list boundary and marker values for an owned SSR host. */
export interface HydrationListRange {
	readonly start: Comment;
	readonly end: Comment;
	readonly emptyMarker: string;
	readonly itemsMarker: string;
}

/** Resolve a leading list without searching later content or granting ownership. */
export function getLeadingHydrationListRange(host: Element): HydrationListRange | null {
	let start = host.firstChild;
	let enclosingEnd: Comment | null = null;
	while (start !== null && start.nodeType === 8) {
		const data = (start as Comment).data;
		const list =
			data === HYDRATION_FOR_EMPTY || data === HYDRATION_FOR_ITEMS || isForBindingOpenComment(data);
		const wrapperMultiplicity =
			data === HYDRATION_START
				? 1
				: data.charCodeAt(1) >= 49 && data.charCodeAt(1) <= 57
					? hydrationMarkerMultiplicity(data, true)
					: 0;
		if (!list && wrapperMultiplicity === 0) return null;
		const end = rendererRangeClose(start);
		// All ranges are direct host children; an inner close must precede its wrapper's close.
		if (
			end === null ||
			(enclosingEnd !== null && (end.compareDocumentPosition(enclosingEnd) & 4) === 0)
		)
			return null;
		if (hydrationMarkerMultiplicity(end.data, false) !== (list ? 1 : wrapperMultiplicity))
			return null;
		if (list) {
			const suffix = data.slice(HYDRATION_FOR_EMPTY.length);
			return {
				start: start as Comment,
				end,
				emptyMarker: HYDRATION_FOR_EMPTY + suffix,
				itemsMarker: HYDRATION_FOR_ITEMS + suffix,
			};
		}
		enclosingEnd = end;
		start = start.nextSibling;
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
