// Source ↔ generated position mapping for playground compiler artifacts.
// Type-only output uses exact per-token Volar mappings. Client output uses
// the compiler's V3 source-map anchors; those anchors are deliberately kept
// sparse, so unmapped generated plumbing stays unmapped.
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
	/** First mapped source ranges intersecting a generated AST node range. */
	toSourceRange(from: number, to: number): MappedRange[] | null;
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

const B64 = new Int8Array(128).fill(-1);
for (let index = 0; index < 64; index++) {
	B64['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charCodeAt(index)] = index;
}

function decodeVlqLines(encoded: string): number[][][] | null {
	const lines: number[][][] = [];
	let line: number[][] = [];
	let segment: number[] = [];
	let value = 0;
	let shift = 0;
	for (let index = 0; index < encoded.length; index++) {
		const character = encoded.charCodeAt(index);
		if (character === 59 || character === 44) {
			if (shift !== 0) return null;
			if (segment.length > 0) line.push(segment);
			segment = [];
			if (character === 59) {
				lines.push(line);
				line = [];
			}
			continue;
		}
		const digit = character < 128 ? B64[character] : -1;
		if (digit < 0) return null;
		value += (digit & 31) << shift;
		if (digit & 32) shift += 5;
		else {
			segment.push(value & 1 ? -(value >>> 1) : value >>> 1);
			value = 0;
			shift = 0;
		}
	}
	if (shift !== 0) return null;
	if (segment.length > 0) line.push(segment);
	lines.push(line);
	return lines;
}

function lineStartOffsets(text: string): number[] {
	const starts = [0];
	for (let index = 0; index < text.length; index++) {
		if (text.charCodeAt(index) === 10) starts.push(index + 1);
	}
	return starts;
}

const WORD_CHARACTER = /[A-Za-z0-9_$]/;

function wordRange(text: string, offset: number): MappedRange | null {
	if (offset < 0 || offset >= text.length) return null;
	if (
		!WORD_CHARACTER.test(text[offset]) &&
		offset + 1 < text.length &&
		WORD_CHARACTER.test(text[offset + 1])
	)
		offset++;
	let from = offset;
	let to = offset + 1;
	if (WORD_CHARACTER.test(text[offset])) {
		while (from > 0 && WORD_CHARACTER.test(text[from - 1])) from--;
		while (to < text.length && WORD_CHARACTER.test(text[to])) to++;
	}
	return { from, to };
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
		toSourceRange(from, to) {
			if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from)
				return null;

			// An AST range is half-open. Prefer the narrowest mapping that
			// contains its first character; Volar can emit a parent expression
			// and a nested token at the same generated boundary.
			const atStart = containing(byGen, genPrefixEnds, 'gen', from)?.filter(
				(segment) => segment.gen < to && segment.gen + segment.genLen > from,
			);
			if (atStart?.length) return ranges(atStart, 'src');

			// If the node starts in unmapped compiler plumbing, use the first
			// mapped token inside the node, again narrowing shared boundaries.
			let low = 0;
			let high = byGen.length;
			while (low < high) {
				const middle = (low + high) >> 1;
				if (byGen[middle].gen < from) low = middle + 1;
				else high = middle;
			}
			if (low >= byGen.length || byGen[low].gen >= to) return null;
			const firstMapped = containing(byGen, genPrefixEnds, 'gen', byGen[low].gen)?.filter(
				(segment) => segment.gen < to && segment.gen + segment.genLen > from,
			);
			return firstMapped?.length ? ranges(firstMapped, 'src') : null;
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

/**
 * Build the partial mapping carried by a runtime compiler source map. Each
 * source-map position expands only to its adjacent token; no interpolation is
 * performed across generated code that has no origin information.
 */
export function mappingFromSourceMap(
	map: unknown,
	sourceText: string,
	generatedText: string,
): CodeMapping | null {
	const encoded = (map as { mappings?: unknown } | null | undefined)?.mappings;
	if (typeof encoded !== 'string' || encoded.length === 0) return null;
	const lines = decodeVlqLines(encoded);
	if (!lines) return null;
	const sourceLines = lineStartOffsets(sourceText);
	const generatedLines = lineStartOffsets(generatedText);
	const segments: Segment[] = [];
	let sourceIndex = 0;
	let sourceLine = 0;
	let sourceColumn = 0;
	for (
		let generatedLine = 0;
		generatedLine < lines.length && generatedLine < generatedLines.length;
		generatedLine++
	) {
		let generatedColumn = 0;
		for (const encodedSegment of lines[generatedLine]) {
			generatedColumn += encodedSegment[0];
			if (encodedSegment.length < 4) continue;
			sourceIndex += encodedSegment[1];
			sourceLine += encodedSegment[2];
			sourceColumn += encodedSegment[3];
			if (
				sourceIndex !== 0 ||
				sourceLine < 0 ||
				sourceLine >= sourceLines.length ||
				sourceColumn < 0 ||
				generatedColumn < 0
			)
				continue;
			const source = wordRange(sourceText, sourceLines[sourceLine] + sourceColumn);
			const generated = wordRange(generatedText, generatedLines[generatedLine] + generatedColumn);
			if (!source || !generated) continue;
			segments.push({
				src: source.from,
				gen: generated.from,
				srcLen: source.to - source.from,
				genLen: generated.to - generated.from,
			});
		}
	}
	return createMapping(segments);
}
