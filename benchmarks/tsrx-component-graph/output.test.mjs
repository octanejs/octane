import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeCompiledOutput, assertCycleControls } from './output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { compile } = await import(
	pathToFileURL(path.join(ROOT, 'packages/octane/src/compiler/index.js')).href
);
const sourceRequire = createRequire(path.join(ROOT, 'packages/octane/package.json'));
const { parseModule } = await import(pathToFileURL(sourceRequire.resolve('@tsrx/core')).href);
const options = { mode: 'client', hmr: false, dev: false, autoMemo: true };

function chainSource(components, leaf) {
	const declarations = Array.from({ length: components }, (_, index) => {
		const body = index === components - 1 ? leaf : `<Component${index + 1} />`;
		return `${index === 0 ? 'export ' : ''}function Component${index}() @{ <div>${body}</div> }`;
	});
	return declarations;
}

// The weekly bench gate counts warm plans in the current compiler's output. A
// counter keyed to an older printed shape reports zero for every graph, which
// fails the opaque-cycle control and hides the 2,400-component reachability
// checks behind it.
test('cycle controls read warm plans from the current compiler output', () => {
	assert.doesNotThrow(() => assertCycleControls({ compile, parseModule, options }));
});

test('every component on a same-module path to an opaque leaf keeps a warm plan', () => {
	for (const reverse of [false, true]) {
		const declarations = chainSource(3, '<Opaque />');
		if (reverse) declarations.reverse();
		const opaque = compile(
			`import { Opaque } from './live';\n${declarations.join('\n')}`,
			'opaque-chain.tsrx',
			options,
		);
		assert.equal(opaque.diagnostics.length, 0);
		assert.equal(
			analyzeCompiledOutput(parseModule, opaque.code, 'opaque-chain.compiled.js').warmPlans,
			3,
		);
	}

	const live = compile(
		`import { live } from './live';\n${chainSource(3, '{live as string}').join('\n')}`,
		'live-chain.tsrx',
		options,
	);
	assert.equal(live.diagnostics.length, 0);
	assert.equal(
		analyzeCompiledOutput(parseModule, live.code, 'live-chain.compiled.js').warmPlans,
		0,
	);
});
