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

	it('is byte-stable without a caller random source', () => {
		const config = {
			width: 480,
			height: 280,
			words,
			padding: 3,
		} as const;
		expect(layoutWordcloud(config)).toEqual(layoutWordcloud(config));
	});

	it('uses caller randomness for initial placement and spiral direction', () => {
		let lowCalls = 0;
		let highCalls = 0;
		const low = layoutWordcloud({
			width: 640,
			height: 360,
			words,
			rotate: 0,
			random: () => {
				lowCalls += 1;
				return 0.25;
			},
		});
		const high = layoutWordcloud({
			width: 640,
			height: 360,
			words,
			rotate: 0,
			random: () => {
				highCalls += 1;
				return 0.75;
			},
		});

		expect(lowCalls).toBe(words.length * 3);
		expect(highCalls).toBe(words.length * 3);
		expect(low.map(({ x, y }) => [x, y])).not.toEqual(high.map(({ x, y }) => [x, y]));
	});

	it('invokes a fresh custom spiral with the upstream size and signed steps for each word', () => {
		const sizes: [number, number][] = [];
		const steps: number[] = [];
		const layout = layoutWordcloud({
			width: 1000,
			height: 400,
			words: words.slice(0, 3),
			rotate: 0,
			random: () => 0.75,
			spiral: (size) => {
				sizes.push(size);
				return (step) => {
					steps.push(step);
					return [step * 4, 0];
				};
			},
		});

		expect(layout).toHaveLength(3);
		expect(sizes).toEqual([
			[1000, 400],
			[1000, 400],
			[1000, 400],
		]);
		expect(steps).toContain(0);
		expect(steps.some((step) => step < 0)).toBe(true);
	});
});
