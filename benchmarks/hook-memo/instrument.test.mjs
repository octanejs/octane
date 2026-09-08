import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from './instrument.mjs';

const dependencyRoot =
	process.env.OCTANE_MEMO_EXTERNAL_ROOT || path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(dependencyRoot, 'packages/octane/package.json'));
const { parseModule, builders } = require('@tsrx/core');
const { print } = require('esrap');
const tsx = require('esrap/languages/tsx').default;

function freeze(value, visited = new WeakSet()) {
	if (value === null || typeof value !== 'object' || visited.has(value)) return value;
	visited.add(value);
	for (const child of Object.values(value)) freeze(child, visited);
	return Object.freeze(value);
}

function evaluate(source) {
	const context = { [COUNTER_GLOBAL]: emptyCounters(), result: null };
	vm.runInNewContext(source, context);
	return { value: JSON.stringify(context.result), counters: context[COUNTER_GLOBAL] };
}

test('creation probes preserve values, methods, lexical closures, and rest arguments', () => {
	const source = `
		const make = (...items) => ({ items, read: () => items[0] });
		const first = make(4, 5);
		const second = make(6);
		const holder = {
			method(...values) { return values.length; },
			get value() { return first.read(); }
		};
		const list = [first.read(), second.read(), holder.method(1, 2), holder.value];
		const sized = new Array(2).fill(9);
		globalThis.result = { list, sized, names: [make.name, first.read.name] };
	`;
	const ast = freeze(parseModule(source, 'observer-control.js'));
	const observedSource = instrumentJavaScript(source, 'observer-control.js', 'application', {
		parseModule: () => ast,
		builders,
		print: (program) => print(program, tsx()).code,
	});
	const clean = evaluate(source);
	const observed = evaluate(observedSource);
	assert.equal(observed.value, clean.value);
	assert.equal(observed.value, '{"list":[4,6,2,4],"sized":[9,9],"names":["make","read"]}');
	assert.deepEqual(observed.counters, {
		...emptyCounters(),
		application_functions: 3,
		application_arrayLiterals: 2,
		application_arrayConstructors: 1,
		application_restArrays: 3,
	});
});

test('computed function names are not re-evaluated or changed by observation', () => {
	const source = `
		let keyCalls = 0;
		const key = () => { keyCalls++; return 'dynamic'; };
		const holder = { [key()]: () => 5 };
		let assigned;
		assigned = function () { return this.value; };
		globalThis.result = {
			keyCalls,
			dynamicName: holder.dynamic.name,
			assignedName: assigned.name,
			value: assigned.call({ value: 8 })
		};
	`;
	const observedSource = instrumentJavaScript(source, 'observer-names.js', 'application', {
		parseModule,
		builders,
		print: (program) => print(program, tsx()).code,
	});
	const observed = evaluate(observedSource);
	assert.equal(observed.value, evaluate(source).value);
	assert.equal(
		observed.value,
		'{"keyCalls":1,"dynamicName":"dynamic","assignedName":"assigned","value":8}',
	);
	assert.deepEqual(observed.counters, { ...emptyCounters(), application_functions: 2 });
});
