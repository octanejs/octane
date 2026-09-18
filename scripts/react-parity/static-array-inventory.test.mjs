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
	[
		'for-of over const array',
		`const cases = [{a:1},{a:2}]; for (const entry of cases) { it('case', () => entry); }`,
		2,
	],
	[
		'for-of over inline literal',
		`for (const name of ['a','b','c']) { it(\`\${name} works\`, () => {}); }`,
		3,
	],
	[
		'for-in over const array',
		`const cases = [1,2]; for (const index in cases) { it('case', () => {}); }`,
		2,
	],
	[
		'for-await-of over const array',
		`const cases = [1,2,3]; async function f() { for await (const entry of cases) { it('case', () => {}); } }`,
		3,
	],
	[
		'for-of over typed const array',
		`interface Row { a: number } const cases: Row[] = [{a:1},{a:2}]; for (const entry of cases) { it('case', () => entry); }`,
		2,
	],
	[
		'for-of over destructured entries',
		`const cases = [{a:1},{a:2}]; for (const { a } of cases) { it('case', () => a); }`,
		2,
	],
	[
		'for-of over mutated array',
		`const cases = [1,2]; cases.push(3); for (const entry of cases) { it('case', () => {}); }`,
		null,
	],
	[
		'for-of over runtime expression',
		`for (const entry of getCases()) { it('case', () => {}); }`,
		null,
	],
	[
		'for-of over loop variable',
		`const matrix = [[1,2],[3]]; for (const row of matrix) { for (const entry of row) { it('case', () => {}); } }`,
		null,
	],
	[
		'c-style for loop stays uncountable',
		`for (let index = 0; index < 3; index++) { it('case', () => {}); }`,
		null,
	],
	[
		'nested for-of product',
		`const outer = [1,2]; const inner = ['a','b','c']; for (const a of outer) { for (const b of inner) { it('case', () => ({ a, b })); } }`,
		6,
	],
	[
		'for-of single statement body',
		`const cases = [1,2]; for (const entry of cases) it('case', () => entry);`,
		2,
	],
	[
		'forEach expression callback body',
		`const cases = [1,2]; cases.forEach(entry => it('case', () => entry));`,
		2,
	],
	[
		'forEach expression body with thisArg',
		`const cases = [1,2]; cases.forEach(function log(entry) { it('case', () => entry); }, self);`,
		2,
	],
	[
		'for-of body inside if block',
		`const cases = [1,2]; for (const entry of cases) if (entry) { it('case', () => {}); }`,
		2,
	],
	[
		'for-of over escaping alias stays uncountable',
		`const cases = [1,2]; const alias = cases; for (const entry of alias) { it('case', () => {}); }`,
		null,
	],
]) {
	test(`inventory handles ${name}`, () => {
		const cases = extractTestCases(source);
		assert.equal(cases.length, 1);
		assert.equal(cases[0].estimatedRegistrations, expected);
	});
}
