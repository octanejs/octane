import { forEachRuntimeAstChild } from './compile-universal.js';
import { createRendererRegionResolver } from './renderer-boundaries.js';

const CODE = 'OCTANE_FOR_ROOT_KEY';

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
			const attribute = (root?.openingElement?.attributes ?? root?.attributes ?? []).find(
				(attr) => (attr.name?.name ?? attr.name) === 'key',
			);
			if (attribute && rendererIsDomAt(root)) {
				const name = attribute.name;
				diagnostics.push({
					code: CODE,
					severity: 'warning',
					message:
						`[${CODE}] A \`key\` attribute on the root of a \`@for\` arm uses legacy row-key syntax ` +
						'and can prevent native template compilation. Put the row key in the ' +
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
