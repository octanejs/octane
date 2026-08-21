import { describe, expect, it } from 'vitest';
import { createInputParser as createOctaneParser } from '../../src/input-parser.js';
import octaneMeasureText from '../../src/measure-text.js';
import octaneParseKeypress from '../../src/parse-keypress.js';
import octaneSanitizeAnsi from '../../src/sanitize-ansi.js';
import { createInputParser as createUpstreamParser } from '../../upstream/src/input-parser.js';
import upstreamMeasureText from '../../upstream/src/measure-text.js';
import upstreamParseKeypress from '../../upstream/src/parse-keypress.js';
import upstreamSanitizeAnsi from '../../upstream/src/sanitize-ansi.js';

describe('differential: @octanejs/ink vs pinned Ink 7.1.1', () => {
	// @parity-case differential:ink-framework-neutral-primitives
	it('framework-neutral terminal primitives remain byte-identical', () => {
		const chunks = ['hello\u001B[', '1;5A\u001B[200~pasted\ntext\u001B[201~', '\u007F'];
		const octaneParser = createOctaneParser();
		const upstreamParser = createUpstreamParser();
		expect(chunks.flatMap((chunk) => octaneParser.push(chunk))).toEqual(
			chunks.flatMap((chunk) => upstreamParser.push(chunk)),
		);

		for (const input of ['\u001B[1;5A', '\u001B[Z', '\u001B[97;5u']) {
			expect(octaneParseKeypress(input)).toEqual(upstreamParseKeypress(input));
		}

		const ansi = '\u001B[31mred\u001B[0m\u001B[2J\u001B]8;;https://example.com\u0007link';
		expect(octaneSanitizeAnsi(ansi)).toBe(upstreamSanitizeAnsi(ansi));
		expect(octaneMeasureText('hello\n界')).toEqual(upstreamMeasureText('hello\n界'));
	});
});
