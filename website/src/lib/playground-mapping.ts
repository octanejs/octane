// Source ↔ generated position mapping for the playground's code pane.
// Compiler ASTs retain authored origins directly (a generated node's
// `start`/`end` are AUTHORED offsets, never offsets into the printed code), so
// the code pane cannot map through them and needs the compiler's own
// position artifacts instead. There is one per output target:
//
//   types           `compileTypesInspection().segments` — the type-only print's
//                   map, widened the same way. NOT the editor's Volar mappings:
//                   those carry capability data and drive hover/diagnostics, so
//                   this pane must not be able to perturb them.
//   client/server   `compile({ inspect: true }).inspect.segments` — the module
//                   print's map segments widened with the authored source END
//                   a standard source map cannot carry, plus
//                   `inspect.templates[].origins` for spans baked into hoisted
//                   static template HTML (tag names, attributes, text).
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

export interface MappedPair {
	source: MappedRange[];
	output: MappedRange[];
}

export interface CodeMapping {
	/** Source and output ranges selected by one source-side lookup. */
	pairFromSource(offset: number): MappedPair | null;
	/** Source and output ranges selected by one generated-side lookup. */
	pairFromGenerated(offset: number): MappedPair | null;
}

interface Segment {
	src: number;
	gen: number;
	srcLen: number;
	genLen: number;
	/**
	 * Is this pair an EXACT correspondence the compiler asserted, rather than an
	 * attribution inferred from a source-map position? See `createMapping`.
	 */
	exact: boolean;
}

/**
 * Segments that do NOT strictly contain another segment's authored range, plus
 * those that reproduce their authored text. See the forward-index rule.
 */
function notContainingAnother(
	segments: Segment[],
	reproduces: (segment: Segment) => boolean,
): Set<Segment> {
	const bySrc = [...segments].sort((a, b) => a.src - b.src);
	const keep = new Set<Segment>();
	for (let i = 0; i < bySrc.length; i++) {
		const segment = bySrc[i];
		if (reproduces(segment)) {
			keep.add(segment);
			continue;
		}
		const end = segment.src + segment.srcLen;
		let contains = false;
		// Sorted by src, so anything strictly inside starts at or after this one.
		for (let j = i; j < bySrc.length && bySrc[j].src < end; j++) {
			const other = bySrc[j];
			const otherEnd = other.src + other.srcLen;
			if (otherEnd <= end && (other.src > segment.src || otherEnd < end)) {
				contains = true;
				break;
			}
		}
		if (!contains) keep.add(segment);
	}
	return keep;
}

/** Both documents, when the caller has them — see the forward-index rule below. */
interface MappingTexts {
	source: string;
	generated: string;
}

/**
 * The two directions are not symmetric, because the artifacts are not.
 *
 * Backwards (generated→source) every segment is usable: a generated position
 * has one origin, and even a wide one ("somewhere in this component") is an
 * honest answer.
 *
 * Forwards it is not. A fat segment's authored range is resolved as "the
 * smallest node STARTING at this source offset", so a generated token the
 * printer could attribute no more precisely than to its enclosing declaration
 * comes back carrying that WHOLE declaration's range. Answering from those
 * would light up everything the declaration emitted — `const`, the parameter
 * list, the hoisted stylesheet a `<style>` block became — for a hover anywhere
 * inside it. Worse, a region with NO finer data inside it (all of SSR's static
 * markup, which records no origins) looks indistinguishable from a real
 * mapping, so no size or containment heuristic separates them.
 *
 * So the forward index takes only pairs that are true by construction:
 *
 *   - `exact` segments — Volar token pairs, template origins, and the verbatim
 *     pass, each a correspondence the compiler (or a verified content match)
 *     asserted rather than inferred;
 *   - fat segments whose generated text REPRODUCES the authored text, which is
 *     verifiable here and is what an identifier, a literal or a preserved
 *     expression looks like.
 *
 * Everything else answers only backwards. The cost is silence where the
 * compiler has no origin data (SSR static markup, closing tags); the benefit is
 * that a highlight, when shown, is always right.
 */
function createMapping(
	segments: Segment[],
	texts: MappingTexts | null,
	reprint = false,
): CodeMapping | null {
	if (segments.length === 0) return null;
	const reproduces = (segment: Segment): boolean =>
		segment.srcLen === segment.genLen &&
		(texts === null ||
			texts.source.slice(segment.src, segment.src + segment.srcLen) ===
				texts.generated.slice(segment.gen, segment.gen + segment.genLen));
	// Which segments may answer a source→generated lookup?
	//
	// In a runtime EMIT — a different program from the source — a segment the
	// printer could not place precisely carries its whole enclosing declaration,
	// and answering from those scatters marks across unrelated tokens. Only
	// pairs true by construction qualify: compiler-asserted ones, or ones whose
	// generated text reproduces the authored text.
	//
	// A REPRINT (the type-only output) is the same program printed again, so a
	// segment's authored end is a real node range and its generated span is that
	// node's own image even when the two differ in length: `class="hint"` is
	// emitted as `class="hint hash"`. Those must answer, or attribute values
	// stop resolving. The one thing that still cannot is a segment covering a
	// whole CONSTRUCT — the `@{ … }` body, the component function — which would
	// otherwise win at every position no finer segment covers and highlight the
	// entire component. A segment containing another's source range is exactly
	// that, unless it reproduces its authored text (a preserved expression,
	// which legitimately answers for the punctuation inside it).
	const leafOrReproducing = reprint ? notContainingAnother(segments, reproduces) : null;
	const bySrc = segments
		.filter((segment) =>
			leafOrReproducing === null
				? segment.exact || reproduces(segment)
				: segment.exact || leafOrReproducing.has(segment),
		)
		.sort((a, b) => a.src - b.src || a.gen - b.gen);
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
	const pair = (matched: Segment[] | null, forward: boolean): MappedPair | null => {
		if (!matched) return null;
		const source = ranges(matched, 'src');
		const output = ranges(matched, 'gen');
		if (!source || !output) return null;
		// One authored range legitimately emits a handful of times — an open and
		// a close tag, a mount and an update binding. A larger set is a
		// module-level attribution the printer could place no better, and
		// lighting all of it up communicates nothing. Backwards is never capped:
		// a generated position has exactly one origin.
		if (forward && output.length > FORWARD_RANGE_LIMIT) return null;
		return { source, output };
	};

	return {
		pairFromSource(offset) {
			return pair(containing(bySrc, srcPrefixEnds, 'src', offset), true);
		},
		pairFromGenerated(offset) {
			return pair(containing(byGen, genPrefixEnds, 'gen', offset), false);
		},
	};
}

const FORWARD_RANGE_LIMIT = 8;

const WHITESPACE = /\s/;

/**
 * Close the token map's gaps for the type-only print, which reproduces the
 * authored program almost verbatim.
 *
 * The printer emits one map segment per TOKEN, so anything it copies through
 * WITHOUT tokenizing has no mapping at all — raw JSX text being the visible
 * case (`Hello` in `<p>Hello</p>` highlights nothing in either direction).
 * Rather than enumerate the node types that behave that way, this takes EVERY
 * authored range in the generated Program and keeps the ones that can be
 * placed unambiguously:
 *
 *   - a range a token mapping already covers exactly is left alone (the
 *     compiler's own answer always wins);
 *   - the remainder must appear, exactly once and verbatim, inside the window
 *     the surrounding token mappings bracket.
 *
 * Everything else — reordered, re-indented, rewritten, or merely repeated
 * within its window — is ignored, so a wrong highlight is never invented. That
 * is why the ranges come from the GENERATED Program: a node the transform
 * dropped is never even a candidate.
 *
 * Mutates `segments`, which is always the freshly built list.
 */
function appendVerbatimSegments(
	segments: Segment[],
	source: string,
	generated: string,
	ranges: readonly MappedRange[],
): void {
	if (segments.length === 0) return;
	const mapped = new Set<string>();
	for (const segment of segments) mapped.add(segment.src + ':' + segment.srcLen);

	// Bracketed by the IMMEDIATE neighbours in source order, not by a running
	// maximum: the print reorders whole regions (a component's static JSX is
	// hoisted above the function that returns it), so an earlier authored token
	// is routinely emitted LATER. Neighbours keep the window local; when the
	// reordering falls between the two neighbours themselves the window inverts
	// and the span is simply left unmapped.
	const bySrc = [...segments].sort((a, b) => a.src - b.src);

	for (const range of ranges) {
		let from = range.from;
		let to = Math.min(range.to, source.length);
		// Whitespace-insensitive at the edges: a JSX text run's authored range
		// includes the newline and indentation around it.
		while (from < to && WHITESPACE.test(source[from])) from++;
		while (to > from && WHITESPACE.test(source[to - 1])) to--;
		if (to <= from || mapped.has(from + ':' + (to - from))) continue;
		const content = source.slice(from, to);

		let lo = 0;
		let hi = bySrc.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (bySrc[mid].src < from) lo = mid + 1;
			else hi = mid;
		}
		const previous = lo > 0 ? bySrc[lo - 1] : null;
		const windowStart = previous ? previous.gen + previous.genLen : 0;
		let windowEnd = generated.length;
		for (let i = lo; i < bySrc.length; i++) {
			if (bySrc[i].src >= to) {
				windowEnd = bySrc[i].gen;
				break;
			}
		}
		if (windowEnd - windowStart < content.length) continue;

		const at = generated.indexOf(content, windowStart);
		if (at < 0 || at + content.length > windowEnd) continue;
		const again = generated.indexOf(content, at + 1);
		if (again >= 0 && again + content.length <= windowEnd) continue; // ambiguous
		segments.push({
			src: from,
			gen: at,
			srcLen: content.length,
			genLen: content.length,
			exact: true,
		});
	}
}

/** One `inspect.segments` entry — see `compile({ inspect: true })`. */
export interface InspectSegment {
	genLine: number;
	genCol: number;
	genEndCol: number | null;
	srcStart: number;
	srcEnd: number | null;
	/**
	 * Did the compiler ASSERT this pair rather than infer it from a map
	 * position? Set for the handful of lowerings it can name exactly — an
	 * `onClick`'s slot key, the block helper an `@if`/`@for` becomes.
	 */
	exact?: boolean;
}

/** One `inspect.templates[].origins` entry: an HTML span and its authored range. */
export interface InspectTemplateOrigin {
	start: number;
	end: number;
	srcStart: number;
	srcEnd: number;
	/** `tag-open` | `tag-close` | `attr-name` | `attr-value` | `text` — every kind maps alike. */
	kind?: string;
}

/**
 * An authored range that emits nothing of its own but means the same thing as
 * one that does — a component's closing tag against its opening name. The
 * compiler records the pair; the alias borrows the target's generated ranges.
 */
export interface InspectAlias {
	srcStart: number;
	srcEnd: number;
	ofStart: number;
}

export interface InspectTemplate {
	/** The LOGICAL html the origins index into. */
	html: string;
	/**
	 * The bytes the generated document contains for this template, when the
	 * compiler can say so — the SSR emit bakes each run into a template-literal
	 * quasi and reports it verbatim. Absent for a hoisted client template, whose
	 * html is embedded as a quoted string literal and located by re-escaping.
	 */
	raw?: string;
	origins: readonly InspectTemplateOrigin[];
}

/**
 * Resolve every template's origins into the generated document.
 *
 * Verbatim runs (`raw`) are matched by occurrence: SSR emits static markup in
 * document order and the compiler records it in authored order, so the k-th
 * `</li>` in the output is the k-th `</li>` in the source. Identical runs are
 * therefore told apart — two `<button>` elements get their own spans — and a
 * group whose counts disagree is skipped rather than guessed at.
 */
function appendAllTemplateSegments(
	segments: Segment[],
	source: string | null,
	generated: string,
	templates: readonly InspectTemplate[],
): void {
	/** Verbatim runs, grouped by their exact bytes. */
	const verbatim = new Map<string, InspectTemplate[]>();
	for (const template of templates) {
		if (typeof template.raw !== 'string' || template.raw.length === 0) {
			appendTemplateSegments(segments, source, generated, template);
			continue;
		}
		const group = verbatim.get(template.raw);
		if (group) group.push(template);
		else verbatim.set(template.raw, [template]);
	}

	for (const [raw, group] of verbatim) {
		const occurrences: number[] = [];
		for (let at = generated.indexOf(raw); at >= 0; at = generated.indexOf(raw, at + raw.length)) {
			occurrences.push(at);
		}
		if (occurrences.length !== group.length) continue;
		const ordered = [...group].sort((a, b) => firstOrigin(a) - firstOrigin(b));
		for (let i = 0; i < ordered.length; i++) {
			appendVerbatimTemplateSegments(segments, ordered[i], occurrences[i]);
		}
	}
}

const firstOrigin = (template: InspectTemplate): number => {
	let earliest = Infinity;
	for (const origin of template.origins) earliest = Math.min(earliest, origin.srcStart);
	return earliest;
};

/** Offsets index the run itself, so they need only the run's position added. */
function appendVerbatimTemplateSegments(
	segments: Segment[],
	template: InspectTemplate,
	at: number,
): void {
	for (const origin of template.origins) {
		const { start, end, srcStart, srcEnd } = origin;
		if (!(start >= 0 && end > start && end <= template.html.length && srcEnd > srcStart)) continue;
		segments.push({
			src: srcStart,
			gen: at + start,
			srcLen: srcEnd - srcStart,
			genLen: end - start,
			exact: true,
		});
	}
}

/**
 * Build a mapping for a runtime (client/server) compile from the inspection
 * artifacts of the SAME compile that produced `generated`.
 *
 * Fat segments are `(generated line, column)` anchored; the generated end is
 * the next segment's column on that line (the line end on the last one), so
 * ranges are contiguous and trailing whitespace is trimmed off for a tidy
 * highlight. Segments with no authored end (structural punctuation the printer
 * emits between nodes) carry no source range and are dropped.
 *
 * Template origins add the second dimension: spans inside a hoisted template's
 * HTML — tag names, static attributes and, notably, static TEXT — resolved
 * into the string literal the module print embedded that HTML as.
 *
 * `source` is the authored document the compile consumed. It is optional only
 * so a fixture can exercise the offset math alone; supply it wherever the real
 * answer matters, since it is what tells an emission of the authored text apart
 * from a runtime helper that merely happens to be the same length.
 */
export function mappingFromInspection(
	source: string | null,
	generated: string,
	inspectSegments: readonly InspectSegment[] | null | undefined,
	templates?: readonly InspectTemplate[] | null,
	aliases?: readonly InspectAlias[] | null,
	verbatim?: { ranges: readonly MappedRange[]; reprint?: boolean } | null,
): CodeMapping | null {
	if (!Array.isArray(inspectSegments)) return null;
	const lineStarts = [0];
	for (let i = 0; i < generated.length; i++) {
		if (generated.charCodeAt(i) === 10) lineStarts.push(i + 1);
	}
	const lineEnd = (line: number) =>
		line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : generated.length;

	const segments: Segment[] = [];
	for (const segment of inspectSegments) {
		const { genLine, genCol, genEndCol, srcStart, srcEnd } = segment;
		if (typeof srcEnd !== 'number' || typeof srcStart !== 'number' || srcEnd <= srcStart) continue;
		const lineStart = lineStarts[genLine];
		if (lineStart === undefined) continue;
		const from = lineStart + genCol;
		let end = Math.min(
			typeof genEndCol === 'number' ? lineStart + genEndCol : lineEnd(genLine),
			generated.length,
		);
		while (end > from && WHITESPACE.test(generated[end - 1])) end--;
		if (end <= from) continue;
		segments.push({
			src: srcStart,
			gen: from,
			srcLen: srcEnd - srcStart,
			genLen: end - from,
			exact: segment.exact === true,
		});
	}

	if (Array.isArray(templates)) appendAllTemplateSegments(segments, source, generated, templates);
	if (Array.isArray(aliases)) appendAliasSegments(segments, aliases);
	if (verbatim && source !== null && verbatim.ranges.length > 0) {
		appendVerbatimSegments(segments, source, generated, verbatim.ranges);
	}
	return createMapping(
		segments,
		source === null ? null : { source, generated },
		verbatim?.reprint === true,
	);
}

/**
 * Lend each alias the generated ranges its target already claims — with the
 * target's own provenance, not an asserted one. A target position can carry
 * several segments (an `injectStyle(hash, css)` call claims three), and only
 * the ones the forward filter would accept for the target should answer for
 * the alias, or the alias resolves to strictly more than the thing it aliases.
 */
function appendAliasSegments(segments: Segment[], aliases: readonly InspectAlias[]): void {
	const byTarget = new Map<number, Segment[]>();
	for (const segment of segments) {
		const group = byTarget.get(segment.src);
		if (group) group.push(segment);
		else byTarget.set(segment.src, [segment]);
	}
	for (const alias of aliases) {
		const target = byTarget.get(alias.ofStart);
		if (!target || alias.srcEnd <= alias.srcStart) continue;
		for (const segment of target) {
			segments.push({
				src: alias.srcStart,
				gen: segment.gen,
				srcLen: alias.srcEnd - alias.srcStart,
				genLen: segment.genLen,
				exact: segment.exact,
			});
		}
	}
}

/**
 * Resolve a template's origins into the printed string literal. The recorded
 * offsets index the LOGICAL html, so they are re-based through the literal's
 * escaping; a template whose literal cannot be located (or whose escaping does
 * not round-trip, e.g. astral characters) contributes nothing rather than
 * guessing at shifted offsets.
 */
function appendTemplateSegments(
	segments: Segment[],
	source: string | null,
	generated: string,
	template: InspectTemplate,
): void {
	const { html, origins } = template;
	if (typeof html !== 'string' || html.length === 0 || !Array.isArray(origins)) return;
	const literal = JSON.stringify(html);
	const at = generated.indexOf(literal);
	if (at < 0) return;

	// Logical html offset → offset inside the literal's body.
	const escaped = new Int32Array(html.length + 1);
	let total = 0;
	for (let i = 0; i < html.length; i++) {
		escaped[i] = total;
		total += JSON.stringify(html[i]).length - 2;
	}
	escaped[html.length] = total;
	if (total !== literal.length - 2) return;

	const body = at + 1;
	for (const origin of origins) {
		const { start, end, srcStart, srcEnd } = origin;
		if (!(start >= 0 && end > start && end <= html.length && srcEnd > srcStart)) continue;
		// Corroboration. Attributes the compiler INJECTS have no authored
		// counterpart to point at, and are recorded against the whole opening
		// tag — so a hover on `onClick` would light up the scoped-style `class`
		// the compiler added. An origin wider in source than in HTML has to be
		// found in the text it claims; a span the compiler WIDENED (an authored
		// `class="demo"` merged into `demo tsrx-…`) is corroborated by being
		// wider, not narrower.
		if (
			source !== null &&
			srcEnd - srcStart > end - start &&
			!source.slice(srcStart, srcEnd).includes(html.slice(start, end))
		) {
			continue;
		}
		segments.push({
			src: srcStart,
			gen: body + escaped[start],
			srcLen: srcEnd - srcStart,
			genLen: escaped[end] - escaped[start],
			exact: true,
		});
	}
}

/** React-host TSX is already the typed document, so its mapping is identity. */
export function identityMapping(length: number): CodeMapping | null {
	if (!Number.isSafeInteger(length) || length <= 0) return null;
	const pair = (offset: number): MappedPair | null => {
		if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) return null;
		const from = Math.min(offset, length - 1);
		const range = { from, to: from + 1 };
		return { source: [range], output: [range] };
	};
	return { pairFromSource: pair, pairFromGenerated: pair };
}
