// Fat segments — the position artifact `inspect: true` exposes.
//
// A standard source map carries only a START per generated position, which is
// what makes precise range highlighting impossible from a `.map` alone. These
// enrich the print's decoded mapping lines with the absolute source END, taken
// from the smallest parsed node beginning at that offset.
//
// Shared by BOTH inspection entries — the runtime compile (compile.js) and the
// type-only one (volar.js) — and deliberately dependency-free so importing it
// from the Volar entry does not drag the runtime compiler in with it.

/**
 * Read-only walk over a parsed AST. Local rather than compile.js's `mapAst` so
 * this module stays importable from the Volar entry point.
 * @param {unknown} root @param {(node: any) => void} visit
 */
function walkNodes(root, visit) {
	const seen = new WeakSet();
	/** @param {any} value */
	const step = (value) => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) step(item);
			return;
		}
		if (typeof value.type === 'string') visit(value);
		// A parsed STYLESHEET hangs off its `<style>` element with CSS node
		// offsets in the stylesheet's own coordinate system. Indexing those puts
		// selector ranges beside real source nodes, where they collide with
		// whatever code happens to sit at the same offset — a string literal
		// resolving to a four-character `ClassSelector` range, and only for the
		// occurrence the collision lands on. CSS is not part of the JS/JSX range
		// index, so the subtree stops here.
		if (value.type === 'StyleSheet') return;
		for (const key in value) {
			// Same exclusions the compiler's own AST walk uses. `metadata` holds
			// back-references into a pre-transform copy — and, through it, parsed
			// STYLESHEETS whose node offsets are in the stylesheet's coordinate
			// system rather than the file's. Indexing those puts selector ranges
			// beside real source nodes, where they collide with whatever code
			// happens to sit at the same offset: a string literal resolving to a
			// four-character `ClassSelector` range, and only for the occurrence
			// the collision lands on.
			if (key === 'loc' || key === 'metadata' || key === 'css' || key === 'parent') continue;
			step(value[key]);
		}
	};
	step(root);
}

/**
 * Decode a VLQ `mappings` string into the `[genCol, sourceIndex, srcLine,
 * srcCol]` tuples `buildFatSegments` consumes. The runtime print asks esrap for
 * decoded mappings directly; the type-only print returns them encoded, so this
 * is the adapter for that entry.
 * @param {string} encoded @returns {number[][][]}
 */
export function decodeSourceMappings(encoded) {
	const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	/** @type {number[][][]} */
	const lines = [];
	let sourceIndex = 0;
	let srcLine = 0;
	let srcCol = 0;
	for (const group of encoded.split(';')) {
		/** @type {number[][]} */
		const segments = [];
		let genCol = 0;
		for (const part of group.split(',')) {
			if (part === '') continue;
			/** @type {number[]} */
			const fields = [];
			let shift = 0;
			let value = 0;
			for (const char of part) {
				const integer = CHARS.indexOf(char);
				if (integer === -1) break;
				value += (integer & 31) << shift;
				if (integer & 32) {
					shift += 5;
					continue;
				}
				const negative = value & 1;
				value >>>= 1;
				fields.push(negative ? -value : value);
				shift = 0;
				value = 0;
			}
			if (fields.length === 0) continue;
			genCol += fields[0];
			if (fields.length < 4) {
				segments.push([genCol]);
				continue;
			}
			sourceIndex += fields[1];
			srcLine += fields[2];
			srcCol += fields[3];
			segments.push([genCol, sourceIndex, srcLine, srcCol]);
		}
		lines.push(segments);
	}
	return lines;
}

/**
 * Inspection-only (`inspect: true`): enrich the module print's decoded mapping
 * lines into "fat segments" `{ genLine, genCol, genEndCol, srcStart, srcEnd }`
 * with absolute source offsets. `srcEnd` is resolved through a
 * smallest-node-at-offset index over the parsed AST (read-only walk via
 * mapAst), so a segment pointing at an identifier gets exactly that
 * identifier's range.
 */
/**
 * @param {number[][][]} decodedLines @param {string} source @param {any} parsedAst
 * @param {string} [code] @param {Map<number, { end: number, texts: Set<string> }>} [exactOrigins]
 */
export function buildFatSegments(decodedLines, source, parsedAst, code, exactOrigins) {
	const lineStarts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
	}
	/** @type {Map<number, number>} */
	const smallestEndAt = new Map();
	walkNodes(parsedAst, (node) => {
		if (typeof node.start === 'number' && typeof node.end === 'number') {
			const prev = smallestEndAt.get(node.start);
			if (prev === undefined || node.end < prev) smallestEndAt.set(node.start, node.end);
		}
	});
	const fat = [];
	for (let genLine = 0; genLine < decodedLines.length; genLine++) {
		for (const seg of decodedLines[genLine]) {
			const lineStart = lineStarts[seg[2]];
			if (lineStart === undefined) continue;
			const srcStart = lineStart + seg[3];
			fat.push({
				genLine,
				genCol: seg[0],
				genEndCol: null,
				srcStart,
				srcEnd: smallestEndAt.get(srcStart) ?? null,
			});
		}
	}
	fat.sort(
		(/** @type {any} */ a, /** @type {any} */ b) => a.genLine - b.genLine || a.genCol - b.genCol,
	);
	for (let i = 0; i < fat.length; i++) {
		// Deduped by encodeMappings on the encoded side; keep raw here but give
		// each segment the next DISTINCT column on its line as its end.
		let j = i + 1;
		while (j < fat.length && fat[j].genLine === fat[i].genLine && fat[j].genCol === fat[i].genCol) {
			j++;
		}
		if (j < fat.length && fat[j].genLine === fat[i].genLine) fat[i].genEndCol = fat[j].genCol;
	}
	if (exactOrigins !== undefined && exactOrigins.size > 0 && typeof code === 'string') {
		applyExactOrigins(fat, code, exactOrigins);
	}
	return fat;
}

/**
 * Replace the node-derived source end with the curated one on the segments that
 * name a registered lowering (see registerExactOrigin), and flag them as
 * asserted so a consumer can trust them where an inferred attribution would be
 * too wide to use. Runs once, after generated ends are closed, because the
 * generated TEXT is what tells the claimed token from its siblings.
 * @param {any[]} fat @param {string} code
 * @param {Map<number, { end: number, texts: Set<string> }>} exactOrigins
 */
function applyExactOrigins(fat, code, exactOrigins) {
	const lineStarts = [0];
	for (let i = 0; i < code.length; i++) {
		if (code.charCodeAt(i) === 10) lineStarts.push(i + 1);
	}
	for (const segment of fat) {
		const claim = exactOrigins.get(segment.srcStart);
		if (claim === undefined) continue;
		const lineStart = lineStarts[segment.genLine];
		if (lineStart === undefined) continue;
		const from = lineStart + segment.genCol;
		const to =
			segment.genEndCol === null
				? (lineStarts[segment.genLine + 1] ?? code.length + 1) - 1
				: lineStart + segment.genEndCol;
		// `texts: null` means the offset alone identifies the token — true for a
		// CLAUSE keyword, whose span no other node starts at. A directive's own
		// start is shared with every node of its lowering, so those must name the
		// token they claim.
		if (claim.texts !== null && !claim.texts.has(code.slice(from, to).trim())) continue;
		segment.srcEnd = claim.end;
		segment.exact = true;
	}
}
