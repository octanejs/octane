// Source ↔ output position mapping for the playground's compiled panes —
// clicking in the editor reveals the corresponding output, and vice versa
// (the Svelte-playground interaction). Two constructors, one query shape:
//
//   mappingFromSourceMap — the PROD pane. `octane/compiler`'s `compile()`
//     returns a standard V3 source map (esrap-printed, composed across the
//     compiler's internal rewrites); its VLQ segments are decoded into
//     absolute-offset pairs. Segments carry positions but no lengths, so
//     highlight ranges are expanded to the identifier/word at the position.
//
//   mappingFromVolar — the TYPES pane. `octane/compiler/volar` emits
//     per-token offset mappings (sourceOffsets/generatedOffsets/lengths)
//     for the language service; those lengths are exact, so ranges are used
//     verbatim.
//
// Queries use nearest-preceding-anchor semantics (the source-map convention:
// a mapping applies until the next one), and return EVERY range mapped from
// the matched anchor — one source expression can lower to several places in
// the compiled output (e.g. a value read in both the create and update
// paths), and all of them should light up.
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
	/** Exact lengths when known (Volar); -1 means expand to the word at the offset. */
	srcLen: number;
	genLen: number;
}

const B64 = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) {
	B64['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charCodeAt(i)] = i;
}

/** Decode a V3 `mappings` string into per-generated-line delta segments. */
function decodeVlqLines(encoded: string): number[][][] | null {
	const lines: number[][][] = [];
	let line: number[][] = [];
	let segment: number[] = [];
	let value = 0;
	let shift = 0;
	for (let i = 0; i < encoded.length; i++) {
		const ch = encoded.charCodeAt(i);
		if (ch === 59 /* ; */ || ch === 44 /* , */) {
			if (shift !== 0) return null; // truncated VLQ group
			if (segment.length > 0) line.push(segment);
			segment = [];
			if (ch === 59) {
				lines.push(line);
				line = [];
			}
			continue;
		}
		const digit = ch < 128 ? B64[ch] : -1;
		if (digit < 0) return null;
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
		} else {
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
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) starts.push(i + 1);
	}
	return starts;
}

const WORD_CHAR = /[A-Za-z0-9_$]/;

/**
 * The identifier/word span at `offset`, or the single character there. Map
 * segments frequently anchor on the punctuation JUST BEFORE an identifier
 * (e.g. the `(` in `(setCount)`), so a non-word position steps forward to an
 * adjacent word before expanding — highlighting the identifier, not the paren.
 */
function expandWord(text: string, offset: number): MappedRange {
	if (text.length === 0) return { from: 0, to: 0 };
	if (offset >= text.length) offset = text.length - 1;
	if (
		!WORD_CHAR.test(text[offset]) &&
		offset + 1 < text.length &&
		WORD_CHAR.test(text[offset + 1])
	) {
		offset += 1;
	}
	let from = offset;
	let to = offset + 1;
	if (WORD_CHAR.test(text[offset])) {
		while (from > 0 && WORD_CHAR.test(text[from - 1])) from--;
		while (to < text.length && WORD_CHAR.test(text[to])) to++;
	}
	return { from, to };
}

function createMapping(
	segments: Segment[],
	sourceText: string,
	generatedText: string,
): CodeMapping | null {
	if (segments.length === 0) return null;
	const bySrc = [...segments].sort((a, b) => a.src - b.src || a.gen - b.gen);
	const byGen = [...segments].sort((a, b) => a.gen - b.gen || a.src - b.src);

	// Greatest anchor ≤ offset, plus every segment sharing that anchor.
	const group = (list: Segment[], key: 'src' | 'gen', offset: number): Segment[] | null => {
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
		const anchor = list[found][key];
		let first = found;
		while (first > 0 && list[first - 1][key] === anchor) first--;
		return list.slice(first, found + 1);
	};

	const ranges = (matched: Segment[], side: 'src' | 'gen'): MappedRange[] | null => {
		const text = side === 'gen' ? generatedText : sourceText;
		const seen = new Set<number>();
		const result: MappedRange[] = [];
		for (const segment of matched) {
			const start = side === 'gen' ? segment.gen : segment.src;
			const length = side === 'gen' ? segment.genLen : segment.srcLen;
			const range = length >= 0 ? { from: start, to: start + length } : expandWord(text, start);
			if (range.to <= range.from) continue;
			// Ranges are small; a from<<20|to key would overflow long docs — use both.
			const key = range.from * 0x100000000 + range.to;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(range);
		}
		result.sort((a, b) => a.from - b.from || a.to - b.to);
		return result.length > 0 ? result : null;
	};

	return {
		toGenerated(offset) {
			const matched = group(bySrc, 'src', offset);
			return matched ? ranges(matched, 'gen') : null;
		},
		toSource(offset) {
			const matched = group(byGen, 'gen', offset);
			return matched ? ranges(matched, 'src') : null;
		},
	};
}

/**
 * Build a mapping from a compiler source map (the `map` field `compile()`
 * returns) plus the exact source/generated text the map describes. Returns
 * null when the map is missing, malformed, or empty — navigation simply
 * stays off.
 */
export function mappingFromSourceMap(
	map: unknown,
	sourceText: string,
	generatedText: string,
): CodeMapping | null {
	const mappings = (map as { mappings?: unknown } | null | undefined)?.mappings;
	if (typeof mappings !== 'string' || mappings.length === 0) return null;
	const lines = decodeVlqLines(mappings);
	if (!lines) return null;
	const srcStarts = lineStartOffsets(sourceText);
	const genStarts = lineStartOffsets(generatedText);
	const segments: Segment[] = [];
	let srcIndex = 0;
	let srcLine = 0;
	let srcCol = 0;
	for (let genLine = 0; genLine < lines.length && genLine < genStarts.length; genLine++) {
		let genCol = 0;
		for (const segment of lines[genLine]) {
			genCol += segment[0];
			if (segment.length < 4) continue;
			srcIndex += segment[1];
			srcLine += segment[2];
			srcCol += segment[3];
			// The playground compiles one virtual file per map; skip anything else.
			if (srcIndex !== 0) continue;
			if (srcLine < 0 || srcLine >= srcStarts.length || srcCol < 0 || genCol < 0) continue;
			const src = srcStarts[srcLine] + srcCol;
			const gen = genStarts[genLine] + genCol;
			if (src >= sourceText.length || gen >= generatedText.length) continue;
			segments.push({ src, gen, srcLen: -1, genLen: -1 });
		}
	}
	return createMapping(segments, sourceText, generatedText);
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
	return createMapping(segments, '', '');
}
