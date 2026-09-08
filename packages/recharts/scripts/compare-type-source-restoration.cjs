const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
// Audit only: read independently verified artifacts, never install or execute them.
// Usage: node packages/recharts/scripts/compare-type-source-restoration.cjs \
//   <upstream repository root> <npm package root> <output directory>
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
if (args.length !== 3) {
	throw new Error('Expected upstream repository root, npm package root, and output directory');
}
const [sourceRoot, npmRoot, scratch] = args.map((value) => path.resolve(value));
fs.mkdirSync(scratch, { recursive: true });
const ts = createRequire(root + '/package.json')('typescript');
const record = JSON.parse(
	fs.readFileSync(path.join(__dirname, '../type-source-restoration.json'), 'utf8'),
);
const plan = {
	sourcePin: path.join(sourceRoot, 'src'),
	sourceHashes: Object.fromEntries(
		Object.entries(record.sourceFiles).map(([target, entry]) => [target, entry.upstreamSha256]),
	),
	removals: Object.values(record.sourceFiles).flatMap((entry) =>
		entry.previousJavaScript ? [entry.previousJavaScript.replace(/^src\//, '')] : [],
	),
};
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const pin = plan.sourcePin;
function canonicalNode(node) {
	if (ts.isParenthesizedExpression(node)) return canonicalNode(node.expression);
	const result = { kind: ts.SyntaxKind[node.kind] };
	if (typeof node.text === 'string') result.text = node.text;
	if (ts.isVariableDeclarationList(node))
		result.declarationKind = node.flags & ts.NodeFlags.BlockScoped;
	if (node.flags & ts.NodeFlags.OptionalChain) result.optionalChain = true;
	const children = [];
	ts.forEachChild(node, (child) => {
		children.push(canonicalNode(child));
	});
	if (children.length) result.children = children;
	return result;
}
function normalize(source, filename) {
	const javascript = ts.transpileModule(source, {
		fileName: filename,
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			removeComments: true,
		},
	}).outputText;
	const parsed = ts.createSourceFile(
		filename + '.js',
		javascript,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const imports = new Map(),
		body = [];
	for (const statement of parsed.statements) {
		if (ts.isImportDeclaration(statement)) {
			let specifier = statement.moduleSpecifier.text.replace(/\.(?:tsrx|ts|js)$/, '');
			if (specifier.startsWith('.')) {
				specifier = path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier));
			}
			let memberName;
			if (specifier.startsWith('es-toolkit/compat/')) {
				memberName = specifier.split('/').at(-1);
				specifier = 'es-toolkit/compat';
			}
			if (specifier === 'react') specifier = 'octane';
			if (specifier === 'react-redux') specifier = '@octanejs/redux';
			const members = imports.get(specifier) || [],
				clause = statement.importClause;
			if (clause?.name) members.push((memberName || 'default') + ' as ' + clause.name.text);
			if (clause?.namedBindings) {
				if (ts.isNamespaceImport(clause.namedBindings))
					members.push('* as ' + clause.namedBindings.name.text);
				else
					for (const element of clause.namedBindings.elements)
						members.push(
							(element.propertyName?.text || element.name.text) + ' as ' + element.name.text,
						);
			}
			if (!clause) members.push('(side effect)');
			imports.set(specifier, members);
		} else body.push(canonicalNode(statement));
	}
	const canonical = JSON.stringify({
		imports: Array.from(imports.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, members]) => [name, members.sort()]),
		body,
	});
	return { canonical, javascript, parsed };
}

function variableInitializer(parsed, name) {
	for (const statement of parsed.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		const declaration = statement.declarationList.declarations.find(
			(item) => item.name.text === name,
		);
		if (declaration) return declaration.initializer;
	}
}

function functionBody(parsed, name) {
	const declaration = parsed.statements.find(
		(statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
	);
	return declaration?.body ?? variableInitializer(parsed, name)?.body;
}

function propertyInitializer(object, name) {
	return object?.properties?.find((property) => property.name?.text === name)?.initializer;
}

function subtreeComparison(before, after) {
	if (!before || !after) return { equal: false, reason: 'Expected subtree was not found' };
	const a = JSON.stringify(canonicalNode(before));
	const b = JSON.stringify(canonicalNode(after));
	return {
		equal: a === b,
		beforeNormalizedSha256: hash(a),
		afterNormalizedSha256: hash(b),
	};
}

function comparison(before, after, filename, lane) {
	const a = normalize(before, filename),
		b = normalize(after, filename);
	const result = {
		equal: a.canonical === b.canonical,
		beforeNormalizedSha256: hash(a.canonical),
		afterNormalizedSha256: hash(b.canonical),
	};
	if (!result.equal) {
		const output = path.join(scratch, 'runtime-diffs', lane, filename);
		fs.mkdirSync(path.dirname(output), { recursive: true });
		fs.writeFileSync(output + '.before.js', a.javascript);
		fs.writeFileSync(output + '.after.js', b.javascript);
	}
	if (
		lane === 'source' &&
		/^state\/(cartesianAxis|graphicalItems|tooltip)Slice\.ts$/.test(filename)
	) {
		const sliceName = path.basename(filename, '.ts');
		const originalSliceCall = variableInitializer(a.parsed, sliceName);
		const currentSliceCall = variableInitializer(b.parsed, sliceName);
		result.reducerObject = subtreeComparison(
			propertyInitializer(originalSliceCall?.arguments?.[0], 'reducers'),
			variableInitializer(b.parsed, 'caseReducers') ??
				propertyInitializer(currentSliceCall?.arguments?.[0], 'reducers'),
		);
	}
	if (lane === 'source' && filename === 'util/createEventProxy.ts') {
		const originalBody = functionBody(a.parsed, 'createEventProxy');
		const currentBody = functionBody(b.parsed, 'createEventProxy');
		const remaining = originalBody.statements.filter((statement) => {
			if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression))
				return true;
			const call = statement.expression;
			return !(
				ts.isPropertyAccessExpression(call.expression) &&
				call.expression.expression.text === 'reactEvent' &&
				call.expression.name.text === 'persist' &&
				call.arguments.length === 0
			);
		});
		result.nativeEventProxy = {
			removedPersistCalls: originalBody.statements.length - remaining.length,
			remainingStatementsEqual:
				JSON.stringify(remaining.map(canonicalNode)) ===
				JSON.stringify(currentBody.statements.map(canonicalNode)),
		};
	}
	if (lane === 'source' && filename === 'util/types.ts') {
		result.restoredPolarGuard = subtreeComparison(
			variableInitializer(a.parsed, 'isPolarCoordinate'),
			variableInitializer(b.parsed, 'isPolarCoordinate'),
		);
	}
	if (lane === 'authored' && filename === 'src/util/types.ts') {
		result.preservedFunctions = Object.fromEntries(
			['adaptEventHandlers', 'adaptEventsOfChild', 'getEventHandlerOfChild', 'isNonEmptyArray'].map(
				(name) => [
					name,
					subtreeComparison(functionBody(a.parsed, name), functionBody(b.parsed, name)),
				],
			),
		);
	}
	return result;
}
const sourceResults = [];
for (const [target, expectedHash] of Object.entries(plan.sourceHashes)) {
	const candidates = [target, target.replace(/\.ts$/, '.tsx')].filter((file) =>
		fs.existsSync(path.join(pin, file)),
	);
	if (candidates.length !== 1) throw new Error('Source counterpart ambiguity: ' + target);
	const source = candidates[0],
		before = fs.readFileSync(path.join(pin, source), 'utf8');
	if (hash(before) !== expectedHash) throw new Error('Source integrity: ' + source);
	const after = fs.readFileSync(root + '/packages/recharts/src/' + target, 'utf8');
	sourceResults.push({
		source: 'src/' + source,
		target: 'src/' + target,
		sourceSha256: expectedHash,
		...comparison(before, after, target, 'source'),
	});
}
const compiledResults = [];
for (const target of plan.removals) {
	const before = fs.readFileSync(npmRoot + '/es6/' + target, 'utf8');
	const after = execFileSync(
		'git',
		['show', record.baselineCommit + ':packages/recharts/src/' + target],
		{ cwd: root, encoding: 'utf8' },
	);
	compiledResults.push({
		source: 'es6/' + target,
		target: 'src/' + target,
		sourceSha256: hash(before),
		...comparison(before, after, target, 'compiled'),
	});
}
const authoredPaths = record.authoredSourceFiles.map((file) => 'packages/recharts/' + file);
const authoredResults = [];
for (const file of authoredPaths) {
	const target = file.replace('packages/recharts/', '');
	const before = execFileSync('git', ['show', record.baselineCommit + ':' + file], {
		cwd: root,
		encoding: 'utf8',
	});
	const after = fs.readFileSync(root + '/' + file, 'utf8');
	authoredResults.push({ target, ...comparison(before, after, target, 'authored') });
}
const evidence = {
	baselineCommit: record.baselineCommit,
	typescriptVersion: ts.version,
	normalizations: [
		'TypeScript-only declarations and assertions erased using transpileModule(target=ES2022,module=ESNext)',
		'AST kinds, literal/identifier text, declaration kind and ordered children compared; comments/formatting/redundant parentheses ignored',
		'Relative module dot segments and .js/.ts/.tsrx suffixes normalized for authored-source resolution',
		'Import groups sorted, preserving imported/local names; documented react->octane, react-redux->@octanejs/redux and es-toolkit compatibility-barrel substitutions applied',
	],
	sourceResults,
	compiledResults,
	authoredResults,
};
fs.writeFileSync(
	scratch + '/erased-runtime-comparison.json',
	JSON.stringify(evidence, null, 2) + '\n',
);
for (const [lane, results] of Object.entries({
	source: sourceResults,
	compiled: compiledResults,
	authored: authoredResults,
}))
	process.stdout.write(
		JSON.stringify(
			{
				lane,
				equal: results.filter((r) => r.equal).length,
				total: results.length,
				differences: results.filter((r) => !r.equal).map((r) => r.target),
			},
			null,
			2,
		) + '\n',
	);
