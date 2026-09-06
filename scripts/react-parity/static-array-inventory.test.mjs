import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractTestCases } from './inventory-lib.mjs';

for (const [name, source, expected] of [
	[
		'const matrix with satisfies',
		`const rows = [{x:1},{x:2}] satisfies Row[]; it.each(rows)('row', () => {});`,
		2,
	],
	[
		'cartesian product',
		`const rows = [1,2,3].flatMap(x => ['a','b'].map(y => ({x,y}))); it.each(rows)('row', () => {});`,
		6,
	],
	[
		'nested tuple array',
		`[['ltr', ['Left','Down']], ['rtl', ['Right','Down']]].forEach(entry => { const [direction, keys] = entry as [direction: string, keys: string[]]; keys.forEach(key => { it('key', () => {}); }); });`,
		4,
	],
	[
		'lexical shadowing',
		`const rows = [1,2,3]; describe('scope', () => { const rows = [1,2]; it.each(rows)('row', () => {}); });`,
		2,
	],
	['mutated matrix', `const rows = [1,2]; rows.push(3); it.each(rows)('row', () => {});`, null],
	['escaping matrix', `const rows = [1,2]; change(rows); it.each(rows)('row', () => {});`, null],
	[
		'escaping alias',
		`const rows = [1,2]; const alias = rows; alias.push(3); it.each(rows)('row', () => {});`,
		null,
	],
	[
		'unequal nested lengths',
		`[[1], [1,2]].forEach(keys => { keys.forEach(key => { it('key', () => {}); }); });`,
		null,
	],
	['runtime filter', `const rows = [1,2].filter(predicate); it.each(rows)('row', () => {});`, null],
]) {
	test(`inventory handles ${name}`, () => {
		const cases = extractTestCases(source);
		assert.equal(cases.length, 1);
		assert.equal(cases[0].estimatedRegistrations, expected);
	});
}
