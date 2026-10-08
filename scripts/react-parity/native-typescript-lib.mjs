// TypeScript 7 (`typescript-native`) helpers the react-parity evidence scripts
// share beyond the syntax API in ../octane-tsc/native-syntax.mjs: tsconfig
// parsing, the classic printer's comment-free `printFile`, AST rewriting, and
// symbol identity inside one file. Everything here returns TypeScript 7 nodes and
// objects: test them with `is` and `SyntaxKind` from native-syntax.mjs, never the
// classic `typescript` helpers, whose `SyntaxKind` numbering differs.
import { importNativeTypeScript } from '../octane-tsc/native.mjs';
import { is, printNode } from '../octane-tsc/native-syntax.mjs';

const { API } = await importNativeTypeScript('unstable/sync');
const { createFileSystem } = await importNativeTypeScript('unstable/fs');
const { getShebang } = await importNativeTypeScript('unstable/ast/scanner');

/**
 * TypeScript 7's node factory. Unlike the classic factory, `createStringLiteral`
 * takes `TokenFlags` (`TokenFlags.None` prints double quotes), `updateCallExpression`
 * takes the `questionDotToken`, and `createNodeArray(elements)` has no trailing comma.
 */
export const factory = await importNativeTypeScript('unstable/ast/factory');
export const { visitEachChild } = await importNativeTypeScript('unstable/ast/visitor');
export const { TokenFlags } = await importNativeTypeScript('unstable/ast');

let api = null;

function projectApi() {
	return (api ??= new API({}));
}

/**
 * Read a tsconfig as TypeScript does: `{ config, error }`, with `config` the raw
 * JSON. Diagnostics carry `text` and `messageChain`; flatten them with
 * `flattenDiagnosticText`.
 *
 * @param {string} configPath absolute tsconfig path
 */
export function readProjectConfig(configPath) {
	return projectApi().readConfigFile(configPath);
}

/**
 * Expand tsconfig JSON from `readProjectConfig` as classic
 * `parseJsonConfigFileContent` does: `{ fileNames, options, errors }`, with
 * absolute `fileNames`. Pass `{ configFileName }` (absolute) for a config read
 * from disk, or `{ configDirectory }` to resolve paths from a directory alone.
 *
 * @param {unknown} json
 * @param {{ configFileName: string } | { configDirectory: string }} options
 */
export function parseProjectConfigContent(json, options) {
	return projectApi().parseJsonConfigFileContent(json, options);
}

/** A diagnostic's message and its chained messages, as classic `flattenDiagnosticMessageText(…, '\n')` spells them. */
export function flattenDiagnosticText(diagnostic, indent = 0) {
	let result = indent ? `\n${'  '.repeat(indent)}` : '';
	result += diagnostic.text;
	for (const next of diagnostic.messageChain ?? []) {
		result += flattenDiagnosticText(next, indent + 1);
	}
	return result;
}

// Two spellings the classic printer kept and TypeScript 7's printer changes:
// - it drops an object literal's trailing comma. A placeholder member carries the
//   comma through printing and is then cut from the text, with the whitespace
//   that led up to it;
// - it parenthesizes a non-null expression that is accessed or called, as in
//   `(a!).b`. The non-null expression prints on its own and joins the rest as an
//   identifier, which takes no parentheses.
const TRAILING_COMMA_MEMBER = '__octaneClassicTrailingComma__';
const TRAILING_COMMA_PLACEHOLDER = /\s*__octaneClassicTrailingComma__/g;

function withClassicPresentation(node) {
	function visit(child) {
		if (is.isNonNullExpression(child)) {
			return factory.createIdentifier(`${printNodeWithoutComments(child.expression)}!`);
		}
		const visited = visitEachChild(child, visit);
		// A rebuilt list loses `hasTrailingComma`, so read it from the parsed node.
		if (!is.isObjectLiteralExpression(child) || !child.properties.hasTrailingComma) return visited;
		return factory.updateObjectLiteralExpression(
			visited,
			factory.createNodeArray([
				...visited.properties,
				factory.createShorthandPropertyAssignment(
					undefined,
					factory.createIdentifier(TRAILING_COMMA_MEMBER),
				),
			]),
		);
	}
	return visit(node);
}

/**
 * Print a parsed or factory-built node as classic `createPrinter({ removeComments:
 * true }).printNode(EmitHint.Unspecified, node, sourceFile)` does, with one known
 * difference: a literal prints from its value, where the classic printer kept its
 * source spelling. `'\u00e9'` and `'é'` both print as `'\u00E9'`, and `0x10` as `16`.
 */
export function printNodeWithoutComments(node) {
	return printNode(withClassicPresentation(node)).replace(TRAILING_COMMA_PLACEHOLDER, '');
}

/**
 * The statements of `sourceFile` as `createPrinter({ removeComments: true })
 * .printFile(sourceFile)` prints them: one per line, without comments. TypeScript
 * 7's printer keeps a whole file's comments but prints a lone node without them.
 */
export function printFileWithoutComments(sourceFile) {
	const shebang = getShebang(sourceFile.text);
	const lines = sourceFile.statements.map(function printStatement(statement) {
		return printNodeWithoutComments(statement);
	});
	if (shebang) lines.unshift(shebang);
	return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * A type checker over `text` alone, parsed as `fileName` (a virtual path), for
 * symbol identity within that file. Symbols and nodes keep their identity until
 * `dispose()`. Ask `checker.getSymbolAtLocation` about nodes of the returned
 * `sourceFile`, not of a separate parse.
 *
 * @param {string} fileName
 * @param {string} text
 * @param {Record<string, unknown>} compilerOptions
 */
export function createSingleFileChecker(fileName, text, compilerOptions) {
	const snapshot = projectApi().createSnapshot({
		fileSystem: createFileSystem([[fileName, text]]),
		createPrograms: [{ rootFiles: [fileName], compilerOptions }],
	});
	const program = snapshot.operation.createdPrograms[0];
	return {
		sourceFile: program.getSourceFile(fileName),
		checker: snapshot.getProject(program.id).checker,
		dispose: () => snapshot.dispose(),
	};
}
