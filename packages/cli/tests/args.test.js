import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/kernel/args.js';
import { EXIT } from '../src/kernel/errors.js';

/** @type {Record<string, import('../src/kernel/args.js').FlagSpec>} */
const FLAGS = {
	fix: { type: 'boolean', short: 'f', description: 'fix' },
	only: { type: 'string', repeatable: true, description: 'only' },
	limit: { type: 'number', description: 'limit' },
	mode: { type: 'string', choices: ['spa', 'ssr'], description: 'mode' },
};

describe('parseArgs', () => {
	it('reads boolean flags, including the --no- form', () => {
		expect(parseArgs(['--fix'], { flags: FLAGS }).flags.fix).toBe(true);
		expect(parseArgs(['-f'], { flags: FLAGS }).flags.fix).toBe(true);
		expect(parseArgs(['--no-color'], { flags: FLAGS }).flags.color).toBe(false);
		expect(parseArgs([], { flags: FLAGS }).flags.color).toBe(true);
	});

	it('accepts both --name=value and --name value', () => {
		expect(parseArgs(['--mode=ssr'], { flags: FLAGS }).flags.mode).toBe('ssr');
		expect(parseArgs(['--mode', 'ssr'], { flags: FLAGS }).flags.mode).toBe('ssr');
	});

	it('collects repeatable flags and defaults them to an empty array', () => {
		expect(parseArgs([], { flags: FLAGS }).flags.only).toEqual([]);
		expect(parseArgs(['--only', 'a', '--only', 'b'], { flags: FLAGS }).flags.only).toEqual([
			'a',
			'b',
		]);
	});

	it('coerces numbers and rejects non-numeric values', () => {
		expect(parseArgs(['--limit', '12'], { flags: FLAGS }).flags.limit).toBe(12);
		expect(() => parseArgs(['--limit', 'lots'], { flags: FLAGS })).toThrow(/expects a number/);
	});

	it('enforces choices', () => {
		expect(() => parseArgs(['--mode', 'native'], { flags: FLAGS })).toThrow(
			/expects one of: spa, ssr/,
		);
	});

	it('rejects an unknown flag rather than treating it as a positional', () => {
		// A typo'd flag that silently becomes a positional is the worst outcome
		// for a command that writes to the project.
		try {
			parseArgs(['--fx'], { flags: FLAGS });
			expect.unreachable('should have thrown');
		} catch (error) {
			expect(error.message).toMatch(/Unknown flag: --fx/);
			expect(error.exitCode).toBe(EXIT.USAGE);
		}
	});

	it('requires a value for non-boolean flags', () => {
		expect(() => parseArgs(['--mode'], { flags: FLAGS })).toThrow(/expects a value/);
		expect(() => parseArgs(['--mode', '--fix'], { flags: FLAGS })).toThrow(/expects a value/);
	});

	it('separates positionals and everything after --', () => {
		const parsed = parseArgs(['one', '--fix', 'two', '--', '--raw', 'three'], { flags: FLAGS });
		expect(parsed.positionals).toEqual(['one', 'two']);
		expect(parsed.rest).toEqual(['--raw', 'three']);
		expect(parsed.flags.fix).toBe(true);
	});
});
