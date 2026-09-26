import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const ts = require('typescript');
const { parseModule } = await import(pathToFileURL(require.resolve('@tsrx/core')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);

// This intentionally recognizes only an explicit immutable-document contract.
// It is not an inference that a regular Octane root cannot update or remount.
const allowedTags = new Set([
	'main',
	'div',
	'section',
	'article',
	'header',
	'footer',
	'nav',
	'h1',
	'h2',
	'h3',
	'p',
	'span',
	'a',
]);

export function analyze(source, file) {
	let ast;
	try {
		ast = parseModule(source, file);
	} catch {
		return null;
	}
	const imports = [];
	const bindings = new Set();
	let exported = null;
	for (const statement of ast.body) {
		if (statement.type === 'ImportDeclaration') {
			if (
				statement.importKind === 'type' ||
				statement.attributes?.length ||
				statement.assertions?.length
			)
				return null;
			if (typeof statement.source?.value !== 'string') return null;
			for (const specifier of statement.specifiers) {
				if (specifier.importKind === 'type' || !specifier.local?.name) return null;
				if (
					!['ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(
						specifier.type,
					)
				)
					return null;
				if (specifier.type === 'ImportSpecifier' && specifier.imported?.type !== 'Identifier')
					return null;
				bindings.add(specifier.local.name);
			}
			imports.push(statement);
			continue;
		}
		if (statement.type !== 'ExportNamedDeclaration' || exported || statement.source) return null;
		const fn = statement.declaration;
		if (
			fn?.type !== 'FunctionDeclaration' ||
			!fn.id?.name ||
			fn.async ||
			fn.generator ||
			fn.params.length !== 0 ||
			fn.typeParameters ||
			fn.returnType ||
			fn.body?.type !== 'JSXCodeBlock' ||
			fn.body.body.length !== 0
		)
			return null;
		exported = fn;
	}
	if (
		!exported ||
		exported.id.name === 'Error' ||
		bindings.has(exported.id.name) ||
		bindings.has('Error')
	)
		return null;
	const root = exported.body.render;
	const rootTag = root?.openingElement?.name?.name;
	if (!['main', 'div'].includes(rootTag)) return null;
	let child = null;
	let hostPath = null;
	const inlineParents = new Set(['p', 'h1', 'h2', 'h3', 'span', 'a']);
	function visit(element, path, hasAnchor = false) {
		if (element?.type !== 'JSXElement') return false;
		const opening = element.openingElement;
		const tag = opening?.name?.type === 'JSXIdentifier' ? opening.name.name : null;
		if (!allowedTags.has(tag)) return false;
		if (tag === 'a' && hasAnchor) return false;
		for (const attribute of opening.attributes) {
			if (attribute.type !== 'JSXAttribute' || attribute.name?.type !== 'JSXIdentifier')
				return false;
			const name = attribute.name.name;
			if (
				!['class', 'className', 'id', 'title', 'href'].includes(name) &&
				!/^aria-[\w-]+$/.test(name) &&
				!/^data-[\w-]+$/.test(name)
			)
				return false;
			if (attribute.value !== null && attribute.value?.type !== 'Literal') return false;
		}
		const contents = element.children.filter(
			(node) => node.type !== 'JSXText' || node.value.trim() !== '',
		);
		if (
			contents.length === 1 &&
			contents[0]?.type === 'JSXElement' &&
			!allowedTags.has(contents[0].openingElement?.name?.name)
		) {
			if (tag !== 'div' || hostPath !== null) return false;
			const candidate = contents[0];
			const name = candidate?.openingElement?.name;
			if (
				candidate.type !== 'JSXElement' ||
				name?.type !== 'JSXIdentifier' ||
				!bindings.has(name.name) ||
				!candidate.openingElement.selfClosing ||
				candidate.openingElement.attributes.length !== 0 ||
				candidate.children.length !== 0
			)
				return false;
			child = name.name;
			hostPath = path;
			return true;
		}
		let index = 0;
		for (const node of element.children) {
			if (node.type === 'JSXText') continue;
			const childTag = node?.openingElement?.name?.name;
			// Avoid HTML-parser repair such as a block automatically closing a <p>,
			// nested anchors, or a nested main that changes the authored DOM path.
			if (
				!allowedTags.has(childTag) ||
				childTag === 'main' ||
				(inlineParents.has(tag) && !['span', 'a'].includes(childTag))
			)
				return false;
			if (!visit(node, [...path, { index, tag: childTag }], hasAnchor || tag === 'a')) return false;
			index++;
		}
		return true;
	}
	if (!visit(root, []) || hostPath === null || hostPath.length === 0 || child === null) return null;
	// A namespace is not a directly imported callable component, even if its local
	// name happens to be capitalized.
	const childImport = imports
		.flatMap((item) => item.specifiers.map((spec) => ({ item, spec })))
		.find(({ spec }) => spec.local.name === child && spec.type !== 'ImportNamespaceSpecifier');
	if (!childImport) return null;
	return {
		imports,
		bindings,
		name: exported.id.name,
		rootTag,
		child,
		hostPath,
		childRequest: childImport.item.source.value,
		childExport:
			childImport.spec.type === 'ImportDefaultSpecifier'
				? 'default'
				: childImport.spec.imported.name,
	};
}

function emit(analysis, site, childVoid) {
	const f = ts.factory;
	const names = new Set([...analysis.bindings, analysis.name]);
	const unique = (base) => {
		let name = base;
		while (names.has(name)) name += '_';
		names.add(name);
		return name;
	};
	const clone = unique('__staticClone');
	const slot = unique('__staticComponentSlot');
	const scope = unique('__staticScope');
	const node = unique('__staticNode');
	const shell = unique('__staticShell');
	const slotNode = unique('__staticSlot');
	const id = (name) => f.createIdentifier(name);
	const prop = (value, name) => f.createPropertyAccessExpression(value, name);
	const call = (value, args) => f.createCallExpression(value, undefined, args);
	const imports = analysis.imports.map((item) => {
		let defaultName;
		let named;
		const specs = [];
		for (const spec of item.specifiers) {
			if (spec.type === 'ImportDefaultSpecifier') defaultName = id(spec.local.name);
			else if (spec.type === 'ImportNamespaceSpecifier')
				named = f.createNamespaceImport(id(spec.local.name));
			else
				specs.push(
					f.createImportSpecifier(
						false,
						spec.imported.name === spec.local.name ? undefined : id(spec.imported.name),
						id(spec.local.name),
					),
				);
		}
		if (specs.length) named = f.createNamedImports(specs);
		const clause = item.specifiers.length
			? f.createImportClause(false, defaultName, named)
			: undefined;
		return f.createImportDeclaration(undefined, clause, f.createStringLiteral(item.source.value));
	});
	imports.push(
		f.createImportDeclaration(
			undefined,
			f.createImportClause(
				false,
				undefined,
				f.createNamedImports([
					f.createImportSpecifier(false, id('clone'), id(clone)),
					f.createImportSpecifier(
						false,
						id(childVoid ? 'componentSlotVoid' : 'componentSlot'),
						id(slot),
					),
				]),
			),
			f.createStringLiteral('octane/internal/client'),
		),
	);
	const declare = (name, value) =>
		f.createVariableStatement(
			undefined,
			f.createVariableDeclarationList(
				[f.createVariableDeclaration(id(name), undefined, undefined, value)],
				ts.NodeFlags.Const,
			),
		);
	const fail = () =>
		f.createThrowStatement(
			f.createNewExpression(id('Error'), undefined, [
				f.createStringLiteral('Static shell prototype requires its exact server DOM.'),
			]),
		);
	const nodeExpr = prop(prop(prop(id(scope), 'block'), 'parentNode'), 'firstChild');
	let pathNode = id(shell);
	for (const item of analysis.hostPath) {
		pathNode = f.createElementAccessExpression(
			prop(pathNode, 'children'),
			f.createNumericLiteral(item.index),
		);
	}
	const hostTag = analysis.hostPath.at(-1).tag;
	const fn = f.createFunctionDeclaration(
		[f.createModifier(ts.SyntaxKind.ExportKeyword)],
		undefined,
		id(analysis.name),
		undefined,
		[
			f.createParameterDeclaration(undefined, undefined, id(unique('__staticProps'))),
			f.createParameterDeclaration(undefined, undefined, id(scope)),
		],
		undefined,
		f.createBlock(
			[
				declare(node, nodeExpr),
				f.createIfStatement(
					f.createBinaryExpression(
						f.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, id(node)),
						ts.SyntaxKind.BarBarToken,
						f.createBinaryExpression(
							prop(id(node), 'localName'),
							ts.SyntaxKind.ExclamationEqualsEqualsToken,
							f.createStringLiteral(analysis.rootTag),
						),
					),
					f.createBlock([fail()], true),
				),
				declare(shell, call(id(clone), [id(node)])),
				declare(slotNode, pathNode),
				f.createIfStatement(
					f.createBinaryExpression(
						f.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, id(slotNode)),
						ts.SyntaxKind.BarBarToken,
						f.createBinaryExpression(
							prop(id(slotNode), 'localName'),
							ts.SyntaxKind.ExclamationEqualsEqualsToken,
							f.createStringLiteral(hostTag),
						),
					),
					f.createBlock([fail()], true),
				),
				f.createExpressionStatement(
					call(id(slot), [
						id(scope),
						f.createNumericLiteral(0),
						id(slotNode),
						id(analysis.child),
						f.createObjectLiteralExpression(),
						prop(id(slotNode), 'firstChild'),
						f.createVoidExpression(f.createNumericLiteral(0)),
						childVoid ? f.createNumericLiteral(2) : f.createFalse(),
						f.createFalse(),
						f.createFalse(),
						f.createStringLiteral(site),
					]),
				),
			],
			true,
		),
	);
	const output = f.createSourceFile(
		[...imports, fn],
		f.createToken(ts.SyntaxKind.EndOfFileToken),
		ts.NodeFlags.None,
	);
	return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(output);
}

const fingerprint = (code) => createHash('sha256').update(code).digest('base64url');
const VOID_META = 'octane:void-component-exports';

export function automaticStaticShell({ root, file, specialize = false, onDecision = () => {} }) {
	if (!path.isAbsolute(root) || !path.isAbsolute(file))
		throw new TypeError('Use absolute root and file paths.');
	const compiler = createOctaneCompiler({
		root,
		environment: 'server',
		requireDirective: false,
		dev: false,
		hmr: false,
		profile: false,
	});
	const clientCompiler = createOctaneCompiler({
		root,
		environment: 'client',
		requireDirective: false,
		dev: false,
		hmr: false,
		profile: false,
	});
	let rootProof = null;
	let buildAllowed = true;
	const transform = {
		name: 'experimental-immutable-shell',
		enforce: 'pre',
		apply: 'build',
		configResolved(config) {
			// A watch rebuild can reuse an importer after the child's contract changes.
			buildAllowed =
				config.isProduction &&
				config.mode === 'production' &&
				!config.build.watch &&
				path.resolve(config.root) === root;
		},
		transform: {
			order: 'pre',
			async handler(source, id, options) {
				if (
					!buildAllowed ||
					options?.ssr ||
					this.environment?.config?.consumer === 'server' ||
					id !== file
				)
					return null;
				const analysis = analyze(source, id);
				if (!analysis) {
					onDecision({ file: id, accepted: false, reason: 'unsupported-source' });
					return null;
				}
				let compiled;
				try {
					compiled = compiler.transform(source, id)?.code;
				} catch {
					onDecision({ file: id, accepted: false, reason: 'server-compile-failed' });
					return null;
				}
				const sites = [...(compiled ?? '').matchAll(/['"](c:[a-f0-9]+)['"]/g)].map(
					(match) => match[1],
				);
				if (sites.length !== 1) {
					onDecision({ file: id, accepted: false, reason: 'ambiguous-site' });
					return null;
				}
				let childVoid = false;
				if (specialize && typeof this.resolve === 'function' && typeof this.load === 'function') {
					try {
						const resolved = await this.resolve(analysis.childRequest, id, { skipSelf: true });
						if (
							resolved &&
							!resolved.external &&
							resolved.id !== id &&
							!resolved.id.includes('?')
						) {
							const loaded = await this.load({ id: resolved.id, resolveDependencies: false });
							const info = this.getModuleInfo?.(resolved.id) ?? loaded;
							const metadata = info?.meta?.[VOID_META];
							childVoid =
								typeof loaded?.code === 'string' &&
								Array.isArray(metadata?.exports) &&
								metadata.exports.includes(analysis.childExport) &&
								metadata.fingerprint === fingerprint(loaded.code);
						}
					} catch {
						// A missing or stale child proof retains the generic component slot.
					}
				}
				if (specialize && !childVoid) {
					onDecision({ file: id, accepted: false, reason: 'child-void-proof-unavailable' });
					return null;
				}
				const code = emit(analysis, sites[0], childVoid);
				const decision = { file: id, accepted: true, site: sites[0], childVoid, rootVoid: false };
				onDecision(decision);
				if (specialize) {
					try {
						const expected = clientCompiler.transform(code, id, {
							environment: 'client',
							hmr: false,
							dev: false,
							profile: false,
							collectVoidComponentExports: true,
						});
						if (typeof expected?.code === 'string')
							rootProof = { name: analysis.name, code: expected.code, decision };
					} catch {
						/* No exact compiled-code comparison means no root proof. */
					}
				}
				return { code, map: null };
			},
		},
	};
	// Publish only for the exact canonical Octane transform of the generated
	// return-free body. The adapter verifies the fingerprint again when loading
	// it, so any later plugin change fails closed.
	const metadata = {
		name: 'experimental-immutable-shell-void-proof',
		enforce: 'post',
		apply: 'build',
		transform: {
			order: 'post',
			handler(code, id, options) {
				if (
					!buildAllowed ||
					options?.ssr ||
					this.environment?.config?.consumer === 'server' ||
					id !== file ||
					rootProof === null ||
					code !== rootProof.code
				)
					return null;
				rootProof.decision.rootVoid = true;
				return {
					code,
					map: null,
					meta: { [VOID_META]: { exports: [rootProof.name], fingerprint: fingerprint(code) } },
				};
			},
		},
	};
	return [transform, metadata];
}
