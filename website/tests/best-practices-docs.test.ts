// @vitest-environment node
// The best-practices guide promises that every example is a TSRX module the
// compiler accepts, that every Avoid example reports the diagnostic it names,
// and that every code it cites exists. This suite holds it to that.
import { readFileSync } from 'node:fs';
import { collectDiagnostics, compile } from 'octane/compiler';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The compiler's internal Data contract check has no declarations.
import { analyzeDataContracts } from '../../packages/octane/src/compiler/data-contracts.js';
// @ts-expect-error The compiler's internal diagnostic catalog has no declarations.
import { STRONG_DIAGNOSTICS } from '../../packages/octane/src/compiler/strong-diagnostics.js';
import guide from '../src/content/docs/best-practices.md?raw';

const fixtureUrl = new URL('./fixtures/best-practices/contracts.data.ts', import.meta.url);

const fences = Array.from(guide.matchAll(/^```(\S*)\n([\s\S]*?)^```$/gm), (match) => {
	const line = guide.slice(0, match.index).split('\n').length + 1;
	const source = match[2];
	const avoid = /^\/\/ Avoid:(.*)$/m.exec(source.split('\n')[0]);
	return {
		lang: match[1],
		filename: `best-practices-line-${line}.tsrx`,
		source,
		avoid: avoid !== null,
		codes: avoid ? (avoid[1].match(/OCTANE_[A-Z_]+/g) ?? []) : [],
	};
});
const prefer = fences.filter((example) => !example.avoid || example.codes.length === 0);
const failing = fences.filter((example) => example.avoid && example.codes.length > 0);

type Diagnostic = { code: string };
const dataCodes = (source: string, filename: string): string[] =>
	(analyzeDataContracts(source, filename).diagnostics as Diagnostic[]).map(({ code }) => code);

it('shows only TSRX examples, with paired Avoid examples', () => {
	expect(fences.map(({ lang }) => lang).filter((lang) => lang !== 'tsrx')).toEqual([]);
	expect(failing.length).toBeGreaterThanOrEqual(10);
});

describe.each(['client', 'server'] as const)('recommended examples (%s)', (mode) => {
	it.for(prefer)('$filename compiles without diagnostics', ({ filename, source }) => {
		expect(compile(source, filename, { mode, dev: false }).diagnostics).toEqual([]);
	});
});

it.for(prefer)('$filename passes the Data contract check', ({ filename, source }) => {
	expect(dataCodes(source, filename)).toEqual([]);
});

it.for(failing)('$filename reports $codes', ({ filename, source, codes }) => {
	const { diagnostics, error } = collectDiagnostics(source, filename, { dev: false });
	const reported = new Set([
		...diagnostics.map(({ code }) => code),
		...((error as Diagnostic | null)?.code ? [(error as Diagnostic).code] : []),
		...dataCodes(source, filename),
	]);
	for (const code of codes) expect(reported, code).toContain(code);
});

it('cites only diagnostic codes the compiler defines', () => {
	const known = new Set([
		...(STRONG_DIAGNOSTICS as Diagnostic[]).map(({ code }) => code),
		...Array.from(
			readFileSync(
				new URL('../../packages/octane/src/compiler/data-contracts.js', import.meta.url),
				'utf8',
			).matchAll(/'(OCTANE_DATA_[A-Z_]+)'/g),
			(match) => match[1],
		),
	]);
	const cited = new Set(guide.match(/OCTANE_[A-Z_]+/g));
	expect([...cited].filter((code) => !known.has(code))).toEqual([]);
});

it('keeps the fixture contracts valid for the Data examples', () => {
	const fixture = readFileSync(fixtureUrl, 'utf8');
	expect(dataCodes(fixture, fixtureUrl.pathname)).toEqual([]);
	const exported = new Set(Array.from(fixture.matchAll(/^export const (\w+)/gm), (m) => m[1]));
	for (const { source } of fences) {
		for (const match of source.matchAll(/import \{([^}]+)\} from '\.\/contracts\.data\.ts'/g)) {
			for (const name of match[1].split(',').map((part) => part.trim())) {
				expect(exported, name).toContain(name);
			}
		}
	}
});
