import {
	OCTANE_CHUNK_PREFIX,
	SC_ATTR,
	SC_ATTR_ACTIVE,
	SC_ATTR_VERSION,
	SC_VERSION,
	SPLITTER,
} from '../constants';
import { InsertionTarget } from '../types';
import { getGroupForId, getIdForGroup, setGroupForId } from './GroupIDAllocator';
import { Sheet } from './types';

const SELECTOR = `style[${SC_ATTR}][${SC_ATTR_VERSION}="${SC_VERSION}"]`;
const OCTANE_SELECTOR = `style[data-octane^="${OCTANE_CHUNK_PREFIX}"]`;
const MARKER_RE = new RegExp(`^${SC_ATTR}\\.g(\\d+)\\[id="([\\w\\d-]+)"\\].*?"([^"]*)`);

/**
 * Type guard to check if a node is a ShadowRoot.
 * Uses instanceof when available, with duck-typing fallback for cross-realm scenarios.
 */
const isShadowRoot = (node: InsertionTarget | Node): node is ShadowRoot => {
	return (
		(typeof ShadowRoot !== 'undefined' && node instanceof ShadowRoot) ||
		('host' in node &&
			// https://dom.spec.whatwg.org/#dom-node-document_fragment_node
			node.nodeType === 11)
	);
};

/**
 * Extract the container (Document or ShadowRoot) from an InsertionTarget.
 * If the target is a ShadowRoot, return it directly.
 * If the target is an HTMLElement, return its root node if it's a ShadowRoot, otherwise return document.
 */
export const getRehydrationContainer = (
	target?: InsertionTarget | undefined,
): Document | ShadowRoot => {
	if (!target) {
		return document;
	}

	// Check if target is a ShadowRoot
	if (isShadowRoot(target)) {
		return target;
	}

	// Check if target is an HTMLElement inside a ShadowRoot
	if ('getRootNode' in target) {
		const root = (target as HTMLElement).getRootNode();
		if (isShadowRoot(root)) {
			return root;
		}
	}

	return document;
};

export const outputSheet = (sheet: Sheet) => {
	const tag = sheet.getTag();
	const { length } = tag;

	let css = '';
	for (let group = 0; group < length; group++) {
		const id = getIdForGroup(group);
		if (id === undefined) continue;

		const names = sheet.names.get(id);
		if (names === undefined || !names.size) continue;

		const rules = tag.getGroup(group);
		if (rules.length === 0) continue;

		const selector = SC_ATTR + '.g' + group + '[id="' + id + '"]';

		let content = '';
		for (const name of names) {
			if (name.length > 0) {
				content += name + ',';
			}
		}

		// NOTE: It's easier to collect rules and have the marker
		// after the actual rules to simplify the rehydration
		css += rules + selector + '{content:"' + content + '"}' + SPLITTER;
	}

	return css;
};

const rehydrateNamesFromContent = (sheet: Sheet, id: string, content: string) => {
	const names = content.split(',');
	let name;

	for (let i = 0, l = names.length; i < l; i++) {
		if ((name = names[i])) {
			sheet.registerName(id, name);
		}
	}
};

const rehydrateSheetFromTag = (sheet: Sheet, style: HTMLStyleElement) => {
	const parts = (style.textContent ?? '').split(SPLITTER);
	const rules: string[] = [];

	for (let i = 0, l = parts.length; i < l; i++) {
		const part = parts[i].trim();
		if (!part) continue;

		const marker = part.match(MARKER_RE);

		if (marker) {
			const group = parseInt(marker[1], 10) | 0;
			const id = marker[2];

			if (group !== 0) {
				// Rehydrate componentId to group index mapping
				setGroupForId(id, group);
				// Rehydrate names and rules
				// looks like: data-styled.g11[id="idA"]{content:"nameA,"}
				rehydrateNamesFromContent(sheet, id, marker[3]);
				sheet.getTag().insertRules(group, rules);
			}

			rules.length = 0;
		} else {
			rules.push(part);
		}
	}
};

/**
 * Octane addition: adopt the chunk tags octane's SSR css channel emitted
 * (`<style data-octane="sc.<componentId>.<name>">`) into the grouped client
 * engine, then remove them — mirroring the upstream data-styled rehydration
 * semantics. Group numbers are allocated fresh on the client; chunk ids only
 * carry the (componentId, name) pair, which is all dedup needs.
 *
 * createGlobalStyle chunks (`sc.sc-global-…`) are left in the DOM: their
 * rules must enter the engine through the owning component instance (which
 * supports theme rewrites and unmount removal), so that component swaps them
 * out pre-paint in its first layout effect instead.
 */
const rehydrateOctaneChunk = (sheet: Sheet, style: HTMLStyleElement) => {
	const chunkId = style.getAttribute('data-octane');
	if (!chunkId) return;

	// Parse from the RIGHT: the name segment is a generated token that never
	// contains `.`, while the componentId is emitted verbatim and may (via a
	// user `withConfig`) contain dots — the raw id must round-trip so
	// `hasNameForId` sees the same id the runtime inserts under.
	const raw = chunkId.slice(OCTANE_CHUNK_PREFIX.length);
	const lastDot = raw.lastIndexOf('.');
	if (lastDot <= 0 || lastDot === raw.length - 1) return;
	const id = raw.slice(0, lastDot);
	const name = raw.slice(lastDot + 1);
	if (id.startsWith('sc-global-')) return;

	const rules = (style.textContent ?? '').split(SPLITTER).filter(Boolean);
	if (rules.length) {
		sheet.registerName(id, name);
		sheet.getTag().insertRules(getGroupForId(id), rules);
	}

	if (style.parentNode) {
		style.parentNode.removeChild(style);
	}
};

export const rehydrateSheet = (sheet: Sheet) => {
	const container = getRehydrationContainer(sheet.options.target);
	const nodes = container.querySelectorAll(SELECTOR);

	for (let i = 0, l = nodes.length; i < l; i++) {
		const node = nodes[i] as any as HTMLStyleElement;
		if (node && node.getAttribute(SC_ATTR) !== SC_ATTR_ACTIVE) {
			rehydrateSheetFromTag(sheet, node);

			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
	}

	const octaneNodes = container.querySelectorAll(OCTANE_SELECTOR);
	for (let i = 0, l = octaneNodes.length; i < l; i++) {
		rehydrateOctaneChunk(sheet, octaneNodes[i] as any as HTMLStyleElement);
	}
};
