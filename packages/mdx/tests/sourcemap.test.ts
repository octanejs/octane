/**
 * Sourcemaps — the pipeline composes a TWO-STAGE map: @mdx-js/mdx (via
 * `SourceMapGenerator`) maps the intermediate JSX back to the `.mdx` source,
 * octane's compiler maps its output back to the intermediate JSX, and
 * `@jridgewell/remapping` chains them.
 */
import { describe, it, expect } from 'vitest';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { compileMdxSync } from '@octanejs/mdx/compile';

// Distinct content on known lines (1-based): heading on 1, paragraph on 3,
// a second heading on 9.
const SOURCE = ['# First', '', 'a paragraph line', '', '- one', '- two', '', '', '## Later'].join(
	'\n',
);

describe('sourcemaps', () => {
	it('returns a valid v3 map whose source is the document', () => {
		const { map } = compileMdxSync(SOURCE, '/docs/doc.mdx');
		expect(map).toBeTruthy();
		const json = JSON.parse(JSON.stringify(map));
		expect(json.version).toBe(3);
		expect(json.sources.some((s: string) => s.endsWith('doc.mdx'))).toBe(true);
		// The fallback (octane's intermediate map) still carries real segments —
		// the module is steppable, just against the intermediate JSX text.
		expect(json.mappings.length).toBeGreaterThan(0);
	});

	it('chains generated positions all the way back to .mdx lines', () => {
		const { code, map } = compileMdxSync(SOURCE, '/docs/doc.mdx');
		const tracer = new TraceMap(JSON.parse(JSON.stringify(map)));
		const genPos = (needle: string) => {
			const lines = code.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const col = lines[i].indexOf(needle);
				if (col !== -1) return { line: i + 1, column: col };
			}
			throw new Error(`needle not in output: ${needle}`);
		};
		const first = originalPositionFor(tracer, genPos('"First"'));
		expect(first.line).toBe(1);
		const later = originalPositionFor(tracer, genPos('"Later"'));
		expect(later.line).toBe(9);
	});

	it('returns a valid (if currently empty) map for server compiles', () => {
		const { map } = compileMdxSync(SOURCE, '/docs/doc.mdx', { mode: 'server' });
		expect(map).toBeTruthy();
		const json = JSON.parse(JSON.stringify(map));
		expect(json.version).toBe(3);
	});
});
