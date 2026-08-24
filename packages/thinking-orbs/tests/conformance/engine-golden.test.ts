import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MODE_FRAMES, resolvePreset, type OrbSize, type OrbState } from '../../src/engine/index';

interface GoldenCase {
	key: string;
	state: OrbState;
	size: OrbSize;
	mode: keyof typeof MODE_FRAMES;
	t: number;
	dotCount: number;
	lineCount: number;
	dots: number[];
	lines: number[];
}

interface GoldenFile {
	resolved: Record<string, ReturnType<typeof resolvePreset>>;
	cases: GoldenCase[];
}

const golden = JSON.parse(
	readFileSync(resolve(import.meta.dirname, '../../upstream/spec/orbs-golden.json'), 'utf8'),
) as GoldenFile;
const round = (value: number) => {
	const rounded = Number(value.toFixed(6));
	return Object.is(rounded, -0) ? 0 : rounded;
};

describe('@octanejs/thinking-orbs engine', () => {
	// @parity-case differential:thinking-orbs-golden
	it('matches all 72 pinned geometry vectors', () => {
		for (const expected of golden.cases) {
			const resolved = resolvePreset(expected.state, expected.size);
			const frame = MODE_FRAMES[resolved.mode](expected.size, expected.t, resolved.opts);
			const dots = frame.dots.flatMap((dot) =>
				[dot.x, dot.y, dot.z, dot.r, dot.white, dot.a ?? 1].map(round),
			);
			const lines = frame.lines.flatMap((line) =>
				[line.x1, line.y1, line.x2, line.y2, line.white, line.a ?? 1, line.w].map(round),
			);
			expect(frame.dots, `${expected.key} dot count`).toHaveLength(expected.dotCount);
			expect(frame.lines, `${expected.key} line count`).toHaveLength(expected.lineCount);
			expect(dots, `${expected.key} dots`).toEqual(expected.dots);
			expect(lines, `${expected.key} lines`).toEqual(expected.lines);
		}
	});

	it('matches every pinned resolved preset', () => {
		for (const [key, expected] of Object.entries(golden.resolved)) {
			const separator = key.lastIndexOf('-');
			const state = key.slice(0, separator) as OrbState;
			const size = Number(key.slice(separator + 1)) as OrbSize;
			expect(resolvePreset(state, size), key).toEqual(expected);
		}
	});
});
