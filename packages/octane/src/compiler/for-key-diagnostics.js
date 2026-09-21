import { createLexicalAnalysis, forEachRuntimeAstChild } from './compile-universal.js';
import { createRendererRegionResolver } from './renderer-boundaries.js';

const CODE = 'OCTANE_FOR_ROOT_KEY';
const BUILTIN_COMPONENTS = new Set(['Activity', 'unstable_Activity', 'Fragment']);

function positionAt(source, offset) {
	let line = 1;
	let column = 0;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return { offset, line, column };
}

/** Inspect authored row-key syntax without changing legacy key resolution or lowering. */
export function analyzeForKeyDiagnostics(ast, source, filename, options = {}) {
	if (!source.includes('@') || (!source.includes('key') && !source.includes('\\u'))) return [];
	const diagnostics = [];
	const rendererIsDomAt = createRendererRegionResolver(ast, source, filename, options);
	let builtinAliases;
	let lexical;
	const isBuiltinComponent = (tag) => {
		// Lowercase builtin aliases also use component or fragment lowering.
		// Resolve their rare candidates against actual scopes so a shadowed
		// lowercase host keeps the same diagnostic as any other intrinsic.
		if (builtinAliases === undefined) {
			builtinAliases = new Map();
			for (const statement of ast.body ?? []) {
				if (statement.type !== 'ImportDeclaration' || statement.source?.value !== 'octane')
					continue;
				for (const specifier of statement.specifiers ?? []) {
					if (
						specifier.type === 'ImportSpecifier' &&
						BUILTIN_COMPONENTS.has(specifier.imported.name)
					) {
						builtinAliases.set(specifier.local.name, statement.source);
					}
				}
			}
		}
		const imported = builtinAliases.get(tag.name);
		if (!imported && tag.name !== 'unstable_Activity') return false;
		lexical ??= createLexicalAnalysis(ast);
		const binding = lexical.resolveBinding(
			lexical.nodeScopes.get(tag) ?? lexical.rootScope,
			tag.name,
		);
		return imported ? binding?.importSource === imported : binding === null;
	};
	const seen = new WeakSet();
	const visit = (node) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (node.type === 'JSXForExpression') {
			// Match the existing legacy row-key lookup. Descendant and conditional
			// subtree keys can own identity independently of the retained row.
			const root = node.body?.body?.find(
				(child) => child.type === 'JSXElement' || child.type === 'Element',
			);
			const tag = root?.openingElement?.name ?? root?.id;
			const isHost =
				(tag?.type === 'JSXIdentifier' || tag?.type === 'Identifier') &&
				typeof tag.name === 'string' &&
				(/^[a-z]/.test(tag.name) || tag.name.includes('-'));
			const attribute = (root?.openingElement?.attributes ?? root?.attributes ?? []).find(
				(attr) => (attr.name?.name ?? attr.name) === 'key',
			);
			if (isHost && attribute && rendererIsDomAt(root) && !isBuiltinComponent(tag)) {
				const name = attribute.name;
				diagnostics.push({
					code: CODE,
					severity: 'warning',
					message:
						`[${CODE}] A \`key\` attribute on an intrinsic DOM root of a \`@for\` arm ` +
						'can prevent native template compilation. Put the row key in the ' +
						'`@for` header (`; key expr`) and remove the root `key` attribute.',
					filename: filename || 'module.tsrx',
					start: positionAt(source, name.start),
					end: positionAt(source, name.end),
				});
			}
		}
		forEachRuntimeAstChild(node, visit);
	};
	visit(ast);
	diagnostics.sort((left, right) => left.start.offset - right.start.offset);
	return diagnostics;
}
