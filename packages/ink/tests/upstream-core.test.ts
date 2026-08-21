import { describe, expect, it } from 'vitest';
import { createInputParser, type InputEvent } from '../src/input-parser.js';
import measureText from '../src/measure-text.js';
import parseKeypress from '../src/parse-keypress.js';
import sanitizeAnsi from '../src/sanitize-ansi.js';

const parseChunks = (chunks: string[]): InputEvent[] => {
	const parser = createInputParser();
	return chunks.flatMap((chunk) => parser.push(chunk));
};

describe('adapted upstream framework-neutral contracts', () => {
	it('separates text, CSI, SS3, and legacy terminal sequences', () => {
		expect(parseChunks(['a\u001B[A\u001BOH\u001B[[5~b'])).toEqual([
			'a',
			'\u001B[A',
			'\u001BOH',
			'\u001B[[5~',
			'b',
		]);
	});

	it('buffers escape sequences split across input chunks', () => {
		const parser = createInputParser();
		expect(parser.push('\u001B[')).toEqual([]);
		expect(parser.hasPendingEscape()).toBe(true);
		expect(parser.push('1;5A')).toEqual(['\u001B[1;5A']);
	});

	it('preserves bracketed paste as one paste event', () => {
		expect(parseChunks(['\u001B[200~hello\nworld\u001B[201~'])).toEqual([
			{ paste: 'hello\nworld' },
		]);
	});

	it('parses navigation modifiers', () => {
		expect(parseKeypress('\u001B[1;5A')).toMatchObject({ name: 'up', ctrl: true });
		expect(parseKeypress('\u001B[Z')).toMatchObject({ name: 'tab', shift: true });
	});

	it('measures wide and multiline terminal text', () => {
		expect(measureText('hello\n界')).toEqual({ width: 5, height: 2 });
	});

	it('keeps SGR and OSC but strips cursor control sequences', () => {
		const input =
			'\u001B[31mred\u001B[0m\u001B[2J\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007';
		const output = sanitizeAnsi(input);
		expect(output).toContain('\u001B[31mred\u001B[0m');
		expect(output).not.toContain('\u001B[2J');
		expect(output).toContain('https://example.com');
	});
});
