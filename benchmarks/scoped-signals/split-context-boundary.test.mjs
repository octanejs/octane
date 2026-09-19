import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { measureConsumer } from './split-context-size-audit.mjs';

const { parseModule } = createRequire(path.resolve('packages/octane/package.json'))('@tsrx/core');
const filename = path.resolve('benchmarks/scoped-signals/split-context-consumer.tsrx');
const source = `import {createContext,Hydrate,useContext} from 'octane';
const Theme=createContext('default');
function Reader() @{<span>{useContext(Theme) as string}</span>}
export function App(props) @{<main><Theme value="outer"><Reader/></Theme><Hydrate when={props.when}><Theme value={props.value}><p>{props.value as string}</p></Theme></Hydrate></main>}`;

function walk(node, visit) {
	if (node === null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	visit(node);
	for (const [key, child] of Object.entries(node))
		if (!['loc', 'metadata', 'parent'].includes(key)) walk(child, visit);
}

function facts(authored, query = false, options = {}) {
	const code = compile(
		authored,
		filename + (query ? '?octane-hydrate=' + (query === true ? '0' : query) : ''),
		{
			dev: false,
			hmr: false,
			...options,
		},
	).code;
	const ast = parseModule(code, 'compiled.js');
	const imports = new Map();
	for (const node of ast.body) {
		if (node.type !== 'ImportDeclaration') continue;
		for (const specifier of node.specifiers)
			imports.set(specifier.local.name, specifier.imported?.name);
	}
	const providers = [];
	walk(ast, (node) => {
		if (node.type === 'CallExpression' && node.arguments[3]?.name === 'Theme')
			providers.push(imports.get(node.callee.name));
	});
	return {
		factory: [...imports.values()].includes('__createCompiledContext'),
		providers,
	};
}

test('closed Context proof survives generated split capture slots and both provider graphs', (t) => {
	const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
	process.env.OCTANE_COMPILE_FROZEN_AST = '1';
	try {
		assert.deepEqual(facts(source), { factory: true, providers: ['componentSlotVoid'] });
		assert.deepEqual(facts(source, true), { factory: false, providers: ['componentSlotVoid'] });
		// An authored fallback affects Hydrate's pending ABI but cannot replace
		// the compiler-owned Context capture's identity or provider children.
		const fallback = source.replace('when={props.when}', 'when={props.when} fallback={undefined}');
		assert.equal(facts(fallback).factory, true);
		assert.deepEqual(facts(fallback, true).providers, ['componentSlotVoid']);
		const nested = source.replace(
			'<p>{props.value as string}</p>',
			'<Hydrate when={props.when}><Theme value={props.value}><p>nested</p></Theme></Hydrate>',
		);
		assert.equal(facts(nested).factory, true);
		assert.deepEqual(facts(nested, '0').providers, ['componentSlotVoid']);
		assert.deepEqual(facts(nested, '0.0').providers, ['componentSlotVoid']);
		assert.equal(facts(source, false, { strong: true }).factory, true);
		assert.deepEqual(facts(source, true, { strong: true }).providers, ['componentSlotVoid']);
		t.diagnostic(
			'Original module lifetime proof and exact generated capture binding both remain admitted',
		);
	} finally {
		if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
		else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
	}
});

test('split Context proof declines authored identity escapes, overrides and unproven provider children', (t) => {
	const variants = [
		source + '\nexport {Theme};',
		source + '\nexport default Theme;',
		source + '\nconst holder={Theme};',
		source + '\nfunction expose(){return Theme;}',
		source + '\nfunction shadow(Theme){return Theme;}',
		source + '\nfunction reflect(){eval("Theme({children:\'ordinary\'})");}',
		...[
			'children={props.children}',
			'__load={props.load}',
			'__data={props.data}',
			'__proto__={props.proto}',
			'{...props.boundary}',
		].map((attr) => source.replace('when={props.when}', 'when={props.when} ' + attr)),
		source.replace('<Theme value={props.value}>', '<Theme {...props.provider}>'),
		source.replace(
			'<Theme value={props.value}>',
			'<Theme children={props.children} value={props.value}>',
		),
	];
	for (const authored of variants) {
		assert.equal(facts(authored).factory, false, authored);
		assert.deepEqual(facts(authored, true).providers, ['componentSlot'], authored);
	}
	for (const options of [{ dev: true }, { hmr: true }, { profile: true }, { mode: 'server' }]) {
		assert.equal(facts(source, false, options).factory, false, JSON.stringify(options));
		assert.equal(
			facts(source, true, options).providers.includes('componentSlotVoid'),
			false,
			JSON.stringify(options),
		);
	}
	const unsupported = source.replace('when={props.when}', 'when={props.when} data:note="name"');
	assert.equal(
		compile(unsupported, filename, { dev: false, hmr: false }).code.includes(
			'__createCompiledContext',
		),
		false,
	);
	t.diagnostic(
		`${variants.length} original lifetime/configuration controls and four deployment modes`,
	);
});

test('source-selected split consumers retain shared values, opaque notifications and exported returned output', async () => {
	for (const dev of [false, true]) {
		const ordinary = await measureConsumer('.', 'split-context-consumer.tsrx', dev);
		assert.deepEqual(ordinary.semantic, {
			initial: 'outerfirst',
			updated: 'outersecond',
			identity: true,
			effects: ['mount', 'cleanup'],
			cleaned: true,
		});
		const opaque = await measureConsumer('.', 'split-context-opaque-consumer.tsrx', dev);
		assert.deepEqual(opaque.semantic, {
			initial: 'plain',
			opaque: 'first',
			notification: 'second',
			title: 'second',
			identity: true,
			draft: 'typed',
			retired: 'second',
			descriptor: 'provided',
			returned: 'ordinary text',
			effects: ['mount', 'cleanup'],
			cleaned: true,
		});
	}
});

test('a closed split Context consumer deletes generic output work while an opaque factory stays complete', async () => {
	const authored = readFileSync(filename, 'utf8');
	const indirect = authored.replace(
		"const Theme = createContext('default');",
		"const contextFactory = createContext;\nconst Theme = contextFactory('default');",
	);
	assert.notEqual(indirect, authored);
	const closed = await measureConsumer('.');
	const opaque = await measureConsumer('.', 'split-context-consumer.tsrx', false, indirect);
	assert.deepEqual(closed.semantic, opaque.semantic);
	assert.equal(closed.outputImports.length, 0);
	assert.equal(opaque.outputImports.length, 0);
	assert.ok(
		opaque.gzip - closed.gzip > 15000,
		`Expected complete consumer deletion: ${closed.gzip} vs ${opaque.gzip} gzip bytes`,
	);
});
