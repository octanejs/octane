import { describe, expect, it } from 'vitest';
import { getEstimatedWordBounds, layoutWordcloud } from '../../src/wordcloud/useWordcloud.tsrx';

const words = [
	{ text: 'visualization', value: 900 },
	{ text: 'octane', value: 625 },
	{ text: 'deterministic', value: 484 },
	{ text: 'server', value: 361 },
	{ text: 'svg', value: 256 },
];

function overlaps(
	a: ReturnType<typeof getEstimatedWordBounds>,
	b: ReturnType<typeof getEstimatedWordBounds>,
): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe('@octanejs/visx deterministic wordcloud layout', () => {
	// OCTANE DIVERGENCE[visx-deterministic-measurement][adapted:visx-deterministic-measurement]:
	// Collision-aware estimated rectangles replace browser/font/d3-cloud packing.
	// @parity-case adapted:visx-deterministic-measurement
	it('places estimated rotated glyph rectangles within bounds without overlap', () => {
		const layout = layoutWordcloud({
			width: 640,
			height: 360,
			words,
			padding: 4,
			rotate: (_, index) => (index % 2 === 0 ? 0 : 30),
		});

		expect(layout).toHaveLength(words.length);
		const bounds = layout.map(getEstimatedWordBounds);
		for (const wordBounds of bounds) {
			expect(wordBounds.left).toBeGreaterThanOrEqual(-320);
			expect(wordBounds.right).toBeLessThanOrEqual(320);
			expect(wordBounds.top).toBeGreaterThanOrEqual(-180);
			expect(wordBounds.bottom).toBeLessThanOrEqual(180);
		}
		for (let i = 0; i < bounds.length; i += 1) {
			for (let j = i + 1; j < bounds.length; j += 1) {
				expect(overlaps(bounds[i], bounds[j]), `${layout[i].text} overlaps ${layout[j].text}`).toBe(
					false,
				);
			}
		}
	});
});
