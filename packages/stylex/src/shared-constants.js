import { createHash } from 'node:crypto';
import babel from '@babel/core';

const IGNORED_AST_FIELDS = new Set([
	'loc',
	'start',
	'end',
	'extra',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);

function closedExpression(node) {
	if (!node) return false;
	switch (node.type) {
		case 'StringLiteral':
		case 'NumericLiteral':
		case 'BooleanLiteral':
		case 'NullLiteral':
		case 'Identifier':
			return true;
		case 'ObjectExpression':
			return node.properties.every(
				(property) =>
					property.type === 'ObjectProperty' &&
					!property.computed &&
					(property.key.name ?? property.key.value) !== '__proto__' &&
					closedExpression(property.value),
			);
		case 'ArrayExpression':
			return node.elements.every(closedExpression);
		case 'ArrowFunctionExpression':
			return (
				!node.async &&
				node.params.every((parameter) => parameter.type === 'Identifier') &&
				closedExpression(node.body)
			);
		case 'ConditionalExpression':
			return (
				closedExpression(node.test) &&
				closedExpression(node.consequent) &&
				closedExpression(node.alternate)
			);
		case 'LogicalExpression':
		case 'BinaryExpression':
			return closedExpression(node.left) && closedExpression(node.right);
		case 'UnaryExpression':
			return node.operator !== 'delete' && closedExpression(node.argument);
		case 'CallExpression':
			// StyleX's numeric-unit normalization is a closed, immediately invoked
			// arrow. Imported calls, accessors and arbitrary initialization stay local.
			return (
				node.callee.type === 'ArrowFunctionExpression' &&
				closedExpression(node.callee) &&
				node.arguments.every(closedExpression)
			);
		default:
			return false;
	}
}

function recipeClosure(program, name, t, originalBindings) {
	const selected = new Map();
	const visiting = new Set();
	const visit = (binding) => {
		if (selected.has(binding)) return true;
		if (
			visiting.has(binding) ||
			(binding?.identifier.name !== name && originalBindings.has(binding?.identifier.name)) ||
			!binding?.constant ||
			!binding.path.isVariableDeclarator() ||
			binding.path.parentPath.node.kind !== 'const' ||
			!closedExpression(binding.path.node.init)
		)
			return false;
		visiting.add(binding);
		let valid = true;
		const reference = (path) => {
			const dependency = path.scope.getBinding(path.node.name);
			if (dependency?.scope === program.scope) valid &&= visit(dependency);
			else if (!dependency && !['undefined', 'NaN', 'Infinity'].includes(path.node.name))
				valid = false;
		};
		const initial = binding.path.get('init');
		if (initial.isReferencedIdentifier()) reference(initial);
		initial.traverse({ ReferencedIdentifier: reference });
		visiting.delete(binding);
		if (valid) selected.set(binding, binding.path.node);
		return valid;
	};
	const root = program.scope.getBinding(name);
	if (!visit(root)) return null;
	const ast = t.file(
		t.program(
			[...selected].map(([binding, node]) => {
				const declaration = t.variableDeclaration('const', [t.cloneNode(node, true)]);
				return binding === root ? t.exportNamedDeclaration(declaration) : declaration;
			}),
		),
	);
	// Generated helper names vary with the surrounding component. Their lexical
	// identity, not a compiler's temporary numbering, determines the shared data.
	babel.traverse(ast, {
		Program(path) {
			let prefix = '_octaneStylex';
			while (Object.keys(path.scope.bindings).some((key) => key.startsWith(prefix))) prefix += '_';
			let index = 0;
			for (const binding of selected.keys()) {
				if (binding !== root) path.scope.rename(binding.identifier.name, `${prefix}${index++}`);
			}
			path.stop();
		},
	});
	return ast;
}

function isStylexCreate(binding, sources) {
	const init = binding.path.node.init;
	if (init?.type !== 'CallExpression' || init.arguments.length !== 1) return false;
	let callee = binding.path.get('init.callee');
	let imported = 'create';
	if (
		callee.isMemberExpression() &&
		!callee.node.computed &&
		!callee.node.optional &&
		callee.node.property.name === 'create'
	) {
		callee = callee.get('object');
		imported = '*';
	}
	if (!callee.isIdentifier()) return false;
	const provider = callee.scope.getBinding(callee.node.name)?.path;
	if (!provider || !sources.has(provider.parentPath.node.source?.value)) return false;
	return imported === '*'
		? provider.isImportNamespaceSpecifier() || provider.isImportDefaultSpecifier()
		: provider.isImportSpecifier() &&
				(provider.node.imported.name ?? provider.node.imported.value) === imported;
}

/**
 * Place after StyleX's Babel plugin. The pre hook preserves local folding while
 * preventing usage-dependent reset pruning. The exit hook shares only compiled,
 * closed data; unsupported closures keep their local declaration. Generated
 * modules are returned in metadata.octaneStylexSharedConstants for the bundler.
 */
export function stylexBindingConstants({ types: t }, options = {}) {
	const metadata = options.bindingConstants;
	const enabled =
		options.dev !== true &&
		metadata?.version === 1 &&
		typeof metadata.source === 'string' &&
		Array.isArray(metadata.names);
	const sources = new Set(
		(options.importSources ?? ['@octanejs/stylex', '@stylexjs/stylex']).map((source) =>
			typeof source === 'string' ? source : source.from,
		),
	);
	return {
		name: 'octane-stylex-binding-constants',
		pre(file) {
			// Babel caches plugin instances when callers reuse the same options.
			// PluginPass state is per file, unlike the plugin factory closure.
			this.candidates = new Map();
			this.modules = [];
			if (!enabled) return;
			const candidates = this.candidates;
			const program = file.path;
			program.scope.crawl();
			this.originalBindings = new Set(Object.keys(program.scope.bindings));
			for (const name of new Set(metadata.names)) {
				if (typeof name !== 'string') continue;
				const binding = program.scope.getBinding(name);
				if (
					!binding?.constant ||
					!binding.path.isVariableDeclarator() ||
					!binding.path.parentPath.parentPath.isProgram() ||
					!isStylexCreate(binding, sources)
				)
					continue;
				const exported = program.scope.generateUidIdentifier('octaneBindingConstant');
				candidates.set(name, exported.name);
				program.pushContainer(
					'body',
					t.exportNamedDeclaration(null, [t.exportSpecifier(t.identifier(name), exported)]),
				);
			}
		},
		visitor: {
			Program: {
				exit(program, state) {
					const candidates = this.candidates;
					if (candidates.size === 0) return;
					const temporary = new Set(candidates.values());
					for (const statement of program.get('body')) {
						if (!statement.isExportNamedDeclaration() || statement.node.declaration) continue;
						const specifiers = statement.node.specifiers.filter(
							(specifier) => !temporary.has(specifier.exported.name),
						);
						if (specifiers.length === 0) statement.remove();
						else statement.node.specifiers = specifiers;
					}
					program.scope.crawl();
					for (const name of candidates.keys()) {
						const binding = program.scope.getBinding(name);
						if (!binding?.path.isVariableDeclarator()) continue;
						// Only StyleX-generated helper data joins the recipe. An authored
						// const can have other owners even when its initializer is closed.
						const ast = recipeClosure(program, name, t, this.originalBindings);
						if (ast === null) continue;
						if (binding.referencePaths.length === 0) {
							binding.path.remove();
							continue;
						}
						const fingerprint = createHash('sha256')
							.update(
								JSON.stringify(ast, (key, value) =>
									IGNORED_AST_FIELDS.has(key) ? undefined : value,
								),
							)
							.digest('hex');
						const filename = state.file.opts.filename.split('?')[0].replaceAll('\\', '/');
						const id = `virtual:octane-stylex-bindings/${encodeURIComponent(filename)}/${metadata.source}/${name}/${fingerprint}.js`;
						const declaration = binding.path.parentPath;
						const dependency = t.importDeclaration(
							[t.importSpecifier(t.identifier(name), t.identifier(name))],
							t.stringLiteral(id),
						);
						if (declaration.node.declarations.length === 1) declaration.replaceWith(dependency);
						else {
							binding.path.remove();
							program.unshiftContainer('body', dependency);
						}
						this.modules.push({ id, ast });
					}
				},
			},
		},
		post(file) {
			const modules = this.modules;
			if (modules.length === 0) return;
			file.metadata.octaneStylexSharedConstants = modules.map(({ id, ast }) => {
				const result = babel.transformFromAstSync(ast, file.code, {
					babelrc: false,
					configFile: false,
					filename: file.opts.filename,
					sourceMaps: file.opts.sourceMaps,
					...(options.inputSourceMap ? { inputSourceMap: options.inputSourceMap } : null),
				});
				return { id, code: result.code, map: result.map ?? null };
			});
		},
	};
}
