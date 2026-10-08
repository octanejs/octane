// Syntax-only TypeScript 7 (`typescript-native`) for local tools that parse,
// walk or print TypeScript without a type program. Parsing runs in the native
// compiler's process over its `typescript/unstable/sync` API, so a tool shares
// one API process, started on first use. The process does not keep Node alive,
// so tools need no explicit shutdown.
//
// Nodes come from TypeScript 7: test them with `is` and `SyntaxKind` from here,
// never the classic `typescript` helpers, whose `SyntaxKind` numbering differs.
// A node walks its children with `node.forEachChild(visit)` and reads its source
// with `node.getText(sourceFile)` and `node.getStart(sourceFile)`.
import { importNativeTypeScript } from './native.mjs';

const { API } = await importNativeTypeScript('unstable/sync');

export const { LanguageVariant, ModifierFlags, NodeFlags, ScriptKind, ScriptTarget, SyntaxKind } =
	await importNativeTypeScript('unstable/ast');
export const is = await importNativeTypeScript('unstable/ast/is');

let api = null;

function syntaxApi() {
	return (api ??= new API({}));
}

/**
 * Parse `text` as `fileName`. The script kind follows the file extension unless
 * `scriptKind` (a TypeScript 7 `ScriptKind`) is given. Parsing never reads the
 * file system, and two parses under one name are independent.
 *
 * @param {string} fileName
 * @param {string} text
 * @param {number} [scriptKind]
 */
export function parseSourceFile(fileName, text, scriptKind) {
	return syntaxApi().createSourceFile(
		fileName,
		text,
		scriptKind === undefined ? {} : { scriptKind },
	);
}

/** Print a parsed or factory-built node the way TypeScript's printer does. */
export function printNode(node, options) {
	return syntaxApi().printer.printNode(node, options);
}

/**
 * Whether TypeScript 7 made a node from JSDoc. In a JavaScript file it reparses
 * `@import`, `@typedef`, `@type`, `@satisfies` and other tags into syntax-tree
 * nodes (and statements) flagged `Reparsed`, which the classic parser never
 * produced. That text is a comment, so walks of authored syntax skip them.
 */
export function isReparsed(node) {
	return (node.flags & NodeFlags.Reparsed) !== 0;
}

/**
 * Whether a parse hit a syntax error. A parsed file carries no parse
 * diagnostics; the parser flags the node it finishes after each error instead.
 * Nodes reparsed from JSDoc are skipped, as classic parse diagnostics ignored
 * malformed JSDoc.
 */
export function hasParseErrors(node) {
	if (isReparsed(node)) return false;
	return (
		(node.flags & NodeFlags.ThisNodeHasError) !== 0 || Boolean(node.forEachChild(hasParseErrors))
	);
}

/** Whether a node carries the modifier keyword `kind` (a TypeScript 7 `SyntaxKind`). */
export function hasModifier(node, kind) {
	return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}
