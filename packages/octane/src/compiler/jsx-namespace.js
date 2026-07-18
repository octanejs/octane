import { SVG_ONLY_TAGS } from '../dom-tables.js';

// Namespace inheritance shared by code generation and authored diagnostics.
// The element itself and its children may have different namespaces:
// <foreignObject> remains SVG, while its children return to HTML.
export function nsForSelf(tag, parentNs) {
	if (tag === 'svg') return 'svg';
	if (tag === 'math') return 'mathml';
	if ((parentNs === 'html' || parentNs === 'opaque') && SVG_ONLY_TAGS.has(tag)) return 'svg';
	return parentNs;
}

export function nsForChildren(tag, parentNs) {
	if (tag === 'foreignObject') return 'html';
	if (tag === 'svg') return 'svg';
	if (tag === 'math') return 'mathml';
	if ((parentNs === 'html' || parentNs === 'opaque') && SVG_ONLY_TAGS.has(tag)) return 'svg';
	return parentNs;
}
