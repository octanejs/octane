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
		3,
	],
	[
		'destructured event tables with unequal lengths',
		`const groups = [{type:'a',events:['click'],init:{key:1}},{type:'b',events:['focus','blur']}]; groups.forEach(({type, events, init}) => { describe(type, () => { events.forEach(event => { it(event, () => { dispatch(init); }); }); }); });`,
		3,
	],
	[
		'mutated destructured event table',
		`const groups = [{events:['click']},{events:['focus','blur']}]; groups.forEach(({events}) => { events.push('input'); events.forEach(event => { it(event, () => {}); }); });`,
		null,
	],
	[
		'escaping destructured event table',
		`const groups = [{events:['click']},{events:['focus','blur']}]; groups.forEach(({events}) => { modify(events); events.forEach(event => { it(event, () => {}); }); });`,
		null,
	],
	[
		'unknown nested event table',
		`const groups = [{events:['click']},{events:unknownEvents}]; groups.forEach(({events}) => { events.forEach(event => { it(event, () => {}); }); });`,
		null,
	],
	[
		'early exit in nested iteration',
		`[[1], [1,2]].forEach(keys => { if (condition) return; keys.forEach(key => { it('key', () => {}); }); });`,
		null,
	],
	[
		'mutation through another iteration',
		`const groups = [{events:['click']},{events:['focus','blur']}]; groups.forEach(({events}) => { events.pop(); }); groups.forEach(({events}) => { events.forEach(event => { it(event, () => {}); }); });`,
		null,
	],
	[
		'escape through a nested array',
		`const groups = [{events:['click']},{events:['focus','blur']}]; change([groups]); groups.forEach(({events}) => { events.forEach(event => { it(event, () => {}); }); });`,
		null,
	],
	[
		'empty rows in a nested table',
		`[[], [1,2]].forEach(keys => { keys.forEach(key => { it('key', () => {}); }); });`,
		2,
	],
	[
		'three correlated levels',
		`[[{values:[1]}], [{values:[1,2]}, {values:[3]}]].forEach(groups => { groups.forEach(({values}) => { values.forEach(value => { it('value', () => {}); }); }); });`,
		4,
	],
	[
		'early exit in an intervening suite',
		`[[1], [1,2]].forEach(keys => { describe('scope', () => { if (condition) return; keys.forEach(key => { it('key', () => {}); }); }); });`,
		null,
	],
	[
		'conditional registration in a nested table',
		`[[1], [1,2]].forEach(keys => { keys.forEach(key => { if (condition) it('key', () => {}); }); });`,
		null,
	],
	[
		'unknown callback registrar in a nested table',
		`[[1], [1,2]].forEach(keys => { repeat(() => { keys.forEach(key => { it('key', () => {}); }); }); });`,
		null,
	],
	[
		'conditional outer table',
		`if (condition) [[1], [1,2]].forEach(keys => { keys.forEach(key => { it('key', () => {}); }); });`,
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

for (const [name, declaration, expression, expected] of [
	[
		'imported product',
		"import combinate from 'combinate'; const clickTarget = ['link', 'button'] as const;",
		'combinate({opts:[{fn:()=>true},{fn:()=>false},{disabled:true},{enabled:true}],clickTarget})',
		8,
	],
	[
		'renamed import',
		"import product from 'combinate'; const clickTarget = ['link', 'button'];",
		'product({opts:[{fn:()=>true},{fn:()=>false}],clickTarget})',
		4,
	],
	[
		'shadowed helper',
		"import combinate from 'combinate'; function f(combinate) {",
		'combinate({x:[1,2]})',
		null,
	],
	['local helper', 'const combinate = arbitraryFunction;', 'combinate({x:[1,2]})', null],
	['different module', "import combinate from 'another-module';", 'combinate({x:[1,2]})', null],
	[
		'unknown dimension',
		"import combinate from 'combinate';",
		'combinate({x:unknownRows,y:[1,2]})',
		null,
	],
	[
		'mutated dimension',
		"import combinate from 'combinate'; const x=[1,2]; x.push(3);",
		'combinate({x,y:[1,2]})',
		null,
	],
	[
		'escaping dimension',
		"import combinate from 'combinate'; const x=[1,2]; modify(x);",
		'combinate({x,y:[1,2]})',
		null,
	],
	[
		'dimension escaping through object',
		"import combinate from 'combinate'; const x=[1,2]; modify({x});",
		'combinate({x,y:[1,2]})',
		null,
	],
	['dynamic key', "import combinate from 'combinate';", 'combinate({[key]:[1,2]})', null],
	[
		'prototype key',
		"import combinate from 'combinate';",
		'combinate({__proto__:[1,2],x:[1]})',
		null,
	],
	[
		'spread object',
		"import combinate from 'combinate';",
		'combinate({...dimensions,x:[1,2]})',
		null,
	],
	['duplicate key', "import combinate from 'combinate';", 'combinate({x:[1,2],"x":[3]})', null],
	[
		'getter dimension',
		"import combinate from 'combinate';",
		'combinate({get x(){return [1,2]}})',
		null,
	],
	['empty dimension', "import combinate from 'combinate';", 'combinate({x:[],y:[1,2]})', null],
	[
		'oversize product',
		"import combinate from 'combinate';",
		`combinate({x:[${Array(101).fill(1)}],y:[${Array(100).fill(1)}]})`,
		null,
	],
]) {
	test(`inventory handles combinate ${name}`, () => {
		const source = `${declaration} const rows = ${expression}; it.each(rows)('case', () => {}); ${name === 'shadowed helper' ? '}' : ''}`;
		const cases = extractTestCases(source);
		assert.equal(cases.length, 1);
		assert.equal(cases[0].estimatedRegistrations, expected);
	});
}

for (const [name, source, expected] of [
	[
		'literal for-of',
		"for (const mode of ['position','transform'] as const) { test.describe(`mode=${mode}`, () => { test('positions', () => {}); }); }",
		2,
	],
	[
		'const for-of',
		"const modes = ['position','transform']; for (const mode of modes) { test('positions', () => {}); }",
		2,
	],
	[
		'nested for-of',
		"for (const x of [1,2]) { for (const y of [1,2,3]) { test('positions', () => {}); } }",
		6,
	],
	[
		'mutated for-of input',
		"const modes = ['position','transform']; for (const mode of modes) { modes.pop(); test('positions', () => {}); }",
		null,
	],
	[
		'escaping for-of input',
		"const modes = ['position','transform']; modify(modes); for (const mode of modes) { test('positions', () => {}); }",
		null,
	],
	[
		'for-of early exit',
		"for (const mode of ['position','transform']) { if (condition) break; test('positions', () => {}); }",
		null,
	],
	[
		'for-of skipped iteration',
		"for (const mode of ['position','transform']) { if (condition) continue; test('positions', () => {}); }",
		null,
	],
	[
		'async iterator',
		"for await (const mode of ['position','transform']) { test('positions', () => {}); }",
		null,
	],
	['dynamic for-of', "for (const mode of getModes()) { test('positions', () => {}); }", null],
]) {
	test(`inventory handles ${name}`, () => {
		const cases = extractTestCases(source);
		assert.equal(cases.length, 1);
		assert.equal(cases[0].estimatedRegistrations, expected);
	});
}
