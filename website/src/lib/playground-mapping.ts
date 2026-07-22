// Source ↔ output position mapping for the playground's TYPES pane —
// clicking in the editor reveals the corresponding output, and vice versa.
// `octane/compiler/volar` emits per-token
// offset mappings (sourceOffsets/generatedOffsets/lengths) for the language
// service; those lengths are exact, so ranges are used verbatim.
//
// Queries select the narrowest range containing the hovered/cursor offset.
// This matters for Volar's nested mappings: a JSX expression maps as one
// range while its identifiers map as smaller ranges. Positions between those
// identifiers must fall back to the containing expression instead of becoming
// spuriously unmapped. A match returns EVERY range mapped from the selected
// source range because one expression can appear in several output locations.
//
// Pure string/offset math — no CodeMirror or DOM imports, so tests can run
// it directly and the editor wiring stays in the page component.

export interface MappedRange {
	from: number;
	to: number;
}

export interface CodeMapping {
	/** Ranges in the generated output mapped from a source offset (document order). */
	toGenerated(offset: number): MappedRange[] | null;
	/** Ranges in the source mapped from a generated-output offset (document order). */
	toSource(offset: number): MappedRange[] | null;
}

/** The Volar mapping entries `compileToVolarMappings` returns. */
export interface VolarTokenMapping {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths?: number[];
}

interface Segment {
	src: number;
	gen: number;
	srcLen: number;
	genLen: number;
}

function createMapping(segments: Segment[]): CodeMapping | null {
	if (segments.length === 0) return null;
	const bySrc = [...segments].sort((a, b) => a.src - b.src || a.gen - b.gen);
	const byGen = [...segments].sort((a, b) => a.gen - b.gen || a.src - b.src);

	const prefixEnds = (list: Segment[], key: 'src' | 'gen'): number[] => {
		const result: number[] = [];
		let maximum = -1;
		for (const segment of list) {
			const length = key === 'src' ? segment.srcLen : segment.genLen;
			maximum = Math.max(maximum, segment[key] + length);
			result.push(maximum);
		}
		return result;
	};
	const srcPrefixEnds = prefixEnds(bySrc, 'src');
	const genPrefixEnds = prefixEnds(byGen, 'gen');

	// Find every range containing the offset, then select the narrowest one.
	// Prefix maxima stop the backwards scan when no earlier range can overlap.
	// At a shared boundary prefer a range STARTING at the cursor; otherwise a
	// cursor parked just after a token still belongs to that token.
	const containing = (
		list: Segment[],
		ends: number[],
		key: 'src' | 'gen',
		offset: number,
	): Segment[] | null => {
		if (!Number.isSafeInteger(offset) || offset < 0) return null;
		let lo = 0;
		let hi = list.length - 1;
		let found = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid][key] <= offset) {
				found = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		if (found < 0) return null;

		const candidates: Segment[] = [];
		for (let i = found; i >= 0 && ends[i] >= offset; i--) {
			const segment = list[i];
			const length = key === 'src' ? segment.srcLen : segment.genLen;
			if (offset <= segment[key] + length) candidates.push(segment);
		}
		if (candidates.length === 0) return null;

		const startsHere = candidates.some((segment) => segment[key] === offset);
		let selected: Segment | null = null;
		let selectedLength = Infinity;
		for (const segment of candidates) {
			if (startsHere && segment[key] !== offset) continue;
			const length = key === 'src' ? segment.srcLen : segment.genLen;
			if (length < selectedLength) {
				selected = segment;
				selectedLength = length;
			}
		}
		if (!selected) return null;
		const selectedStart = selected[key];
		return candidates.filter((segment) => {
			const length = key === 'src' ? segment.srcLen : segment.genLen;
			return segment[key] === selectedStart && length === selectedLength;
		});
	};

	const ranges = (matched: Segment[], side: 'src' | 'gen'): MappedRange[] | null => {
		const seen = new Set<string>();
		const result: MappedRange[] = [];
		for (const segment of matched) {
			const start = side === 'gen' ? segment.gen : segment.src;
			const length = side === 'gen' ? segment.genLen : segment.srcLen;
			const range = { from: start, to: start + length };
			if (range.to <= range.from) continue;
			const key = range.from + ':' + range.to;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(range);
		}
		result.sort((a, b) => a.from - b.from || a.to - b.to);
		return result.length > 0 ? result : null;
	};

	return {
		toGenerated(offset) {
			const matched = containing(bySrc, srcPrefixEnds, 'src', offset);
			return matched ? ranges(matched, 'gen') : null;
		},
		toSource(offset) {
			const matched = containing(byGen, genPrefixEnds, 'gen', offset);
			return matched ? ranges(matched, 'src') : null;
		},
	};
}

/**
 * Build a mapping from Volar token mappings (the `mappings` field
 * `compileToVolarMappings` returns). Token lengths are exact, so no text is
 * consulted at query time.
 */
export function mappingFromVolar(
	volarMappings: readonly VolarTokenMapping[] | null | undefined,
): CodeMapping | null {
	if (!Array.isArray(volarMappings)) return null;
	const segments: Segment[] = [];
	for (const mapping of volarMappings) {
		const { sourceOffsets, generatedOffsets, lengths } = mapping;
		if (!Array.isArray(sourceOffsets) || !Array.isArray(generatedOffsets)) continue;
		const generatedLengths = Array.isArray(mapping.generatedLengths)
			? mapping.generatedLengths
			: lengths;
		for (let i = 0; i < sourceOffsets.length && i < generatedOffsets.length; i++) {
			const srcLen = lengths[Math.min(i, lengths.length - 1)] ?? 0;
			const genLen = generatedLengths[Math.min(i, generatedLengths.length - 1)] ?? 0;
			if (srcLen <= 0 || genLen <= 0) continue;
			segments.push({ src: sourceOffsets[i], gen: generatedOffsets[i], srcLen, genLen });
		}
	}
	return createMapping(segments);
}
