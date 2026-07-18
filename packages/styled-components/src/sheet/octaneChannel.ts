// Octane addition (not part of upstream styled-components): the bridge between
// the ported sheet engine and octane's SSR css channel.
//
// On the server every inserted (componentId, name) chunk is forwarded to
// octane's `injectStyle`, which collects into the per-request css map that
// `renderToString`/streaming serialize as `<style data-octane="<id>">` tags.
// Chunk ids are `sc.<componentId>.<name>`; `name` is always derived from the
// chunk's css content, so an id can never change content across streaming
// passes (octane emits each id at most once per stream).
import { injectStyle } from 'octane';

import { IS_BROWSER, OCTANE_CHUNK_PREFIX, SPLITTER } from '../constants';

const DOT_RE = /\./g;

/**
 * The name segment must stay dot-free so the LAST dot in a chunk id always
 * delimits componentId from name. Names are generated alphabetic/hash tokens
 * that never contain `.` — this is defensive only. The componentId is kept
 * VERBATIM (user `withConfig` ids may contain dots): rehydration parses from
 * the right, so the raw id round-trips and `hasNameForId` lookups after
 * adoption hit the same id the runtime inserts under.
 */
export function sanitizeChunkPart(part: string): string {
	return part.replace(DOT_RE, '-');
}

export function scChunkId(componentId: string, name: string): string {
	return OCTANE_CHUNK_PREFIX + componentId + '.' + sanitizeChunkPart(name);
}

export function emitChunk(componentId: string, name: string, rules: string[]): void {
	// Browser-constructed server sheets (a ServerStyleSheet created in a test or
	// a client bundle) accumulate in-memory only; the client `injectStyle` has
	// append-to-head semantics that would duplicate what the sheet engine owns.
	if (IS_BROWSER) return;
	injectStyle(scChunkId(componentId, name), rules.join(SPLITTER));
}

/**
 * Removes the server-emitted css-channel tags for one createGlobalStyle
 * component. Called from the component's first layout effect right after it
 * inserted its own rules into the client sheet (synchronous pre-paint, so
 * there is no unstyled flash), because global styles must live in the grouped
 * client engine to support theme-driven rewrites and unmount removal.
 */
export function removeServerGlobalTags(componentId: string): void {
	if (!IS_BROWSER) return;
	const prefix = OCTANE_CHUNK_PREFIX + componentId + '.';
	const nodes = document.querySelectorAll(`style[data-octane^="${prefix}"]`);
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.parentNode) node.parentNode.removeChild(node);
	}
}

export { SPLITTER };
