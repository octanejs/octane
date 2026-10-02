import assert from 'node:assert/strict';

function walkAst(node, visit, seen = new WeakSet()) {
	if (node === null || typeof node !== 'object' || seen.has(node)) return;
	seen.add(node);
	if (Array.isArray(node)) {
		for (const child of node) walkAst(child, visit, seen);
		return;
	}
	if (typeof node.type !== 'string') return;
	visit(node);
	for (const value of Object.values(node)) walkAst(value, visit, seen);
}

/**
 * Read the compiled module's semantic surface from its AST rather than its
 * printed text. A warm plan is a `markWarm(component, plan)` call against the
 * runtime import, whatever alias or statement shape the compiler prints it with.
 */
export function analyzeCompiledOutput(parseModule, code, filename) {
	const ast = parseModule(code, filename);
	let templateBinding = null;
	let singleRootBinding = null;
	let markWarmBinding = null;
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== 'octane') continue;
		for (const specifier of statement.specifiers || []) {
			if (specifier.type !== 'ImportSpecifier') continue;
			if (specifier.imported?.name === 'template') templateBinding = specifier.local.name;
			if (specifier.imported?.name === '__s') singleRootBinding = specifier.local.name;
			if (specifier.imported?.name === 'markWarm') markWarmBinding = specifier.local.name;
		}
	}
	const templates = [];
	let singleRootCapabilities = 0;
	let warmPlans = 0;
	walkAst(ast, (node) => {
		if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return;
		if (node.callee.name === templateBinding && typeof node.arguments[0]?.value === 'string') {
			templates.push(node.arguments[0].value);
		}
		if (node.callee.name === singleRootBinding) singleRootCapabilities++;
		if (node.callee.name === markWarmBinding && node.arguments.length === 2) warmPlans++;
	});
	return { templates, singleRootCapabilities, warmPlans };
}

export function assertCycleControls({ compile, parseModule, options }) {
	const syncCycle = compile(
		'export function CycleA() @{ <CycleB /> }\nfunction CycleB() @{ <CycleA /> }',
		'synchronous-cycle.tsrx',
		options,
	);
	assert.equal(syncCycle.diagnostics.length, 0, 'synchronous cycle emitted compiler diagnostics');
	assert.equal(
		analyzeCompiledOutput(parseModule, syncCycle.code, 'synchronous-cycle.compiled.js').warmPlans,
		0,
		'synchronous cycle gained a warm plan',
	);

	const seededCycle = compile(
		"import { Opaque } from './opaque';\nexport function CycleA() @{ <><CycleB /><Opaque /></> }\nfunction CycleB() @{ <CycleA /> }",
		'opaque-cycle.tsrx',
		options,
	);
	assert.equal(seededCycle.diagnostics.length, 0, 'opaque cycle emitted compiler diagnostics');
	assert.equal(
		analyzeCompiledOutput(parseModule, seededCycle.code, 'opaque-cycle.compiled.js').warmPlans,
		2,
		'opaque cycle lost warm reachability',
	);
}
