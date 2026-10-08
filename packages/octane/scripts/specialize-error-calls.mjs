import { dirname, posix, resolve } from 'node:path';
import {
	hasParseErrors,
	is,
	isReparsed,
	parseSourceFile,
} from '../../../scripts/octane-tsc/native-syntax.mjs';
import { frameworkErrorSurface } from '../../../scripts/error-codes/generate.mjs';

const HELPER = '__octaneNoArgError';
// A specialized module imports its production text from
// error-message-no-arguments.ts instead of carrying its own copy, so every such
// module of a consumer's bundle, and every chunk of a split one, shares it.
const SHARED_FORMATTER = 'formatNoArgumentErrorMessage';

// `filename` is relative to src/, with forward slashes.
function sharedFormatterSpecifier(filename) {
	const specifier = posix.relative(posix.dirname(filename), 'error-message-no-arguments.js');
	return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

// Only modules whose formatter binding has exclusively literal, zero-argument
// calls can stop importing the generic formatter. Unknown forms are left alone.
export function specializeErrorCalls(source, filename, catalog) {
	const surface = frameworkErrorSurface(filename);
	if (surface === undefined) return source;
	const formatter = surface === 'server' ? 'formatServerError' : 'formatClientError';
	const runtime = surface === 'server' ? 'server' : 'client';
	const sourceFile = parseSourceFile(filename, source);
	if (hasParseErrors(sourceFile)) return source;

	const imports = sourceFile.statements.filter((node) => {
		if (!is.isImportDeclaration(node) || !is.isStringLiteral(node.moduleSpecifier)) return false;
		// Bare and absolute specifiers have different resolution rules, even when
		// their text happens to resemble the generated file's name.
		if (!/^\.{1,2}\//.test(node.moduleSpecifier.text)) return false;
		const target = resolve(dirname(filename), node.moduleSpecifier.text);
		return target === resolve(`error-codes.${runtime}.generated.js`);
	});
	if (imports.length !== 1) return source;
	const binding = imports[0].importClause?.namedBindings;
	if (
		imports[0].importClause?.isTypeOnly ||
		imports[0].importClause?.name ||
		!binding ||
		!is.isNamedImports(binding) ||
		binding.elements.length !== 1 ||
		binding.elements[0].isTypeOnly ||
		binding.elements[0].propertyName ||
		binding.elements[0].name.text !== formatter
	) {
		return source;
	}

	let safe = true;
	/** @type {any[]} */
	const calls = [];
	function scan(node) {
		// JSDoc in a .js module reparses into nodes; it is a comment, not code.
		if (isReparsed(node)) return;
		if (is.isIdentifier(node)) {
			// A caller-local process binding would change the lookup that used to
			// happen inside the formatter's module. Conservatively skip any module
			// that mentions process, even when that mention is harmless.
			if (node.text === 'process' || node.text === HELPER) safe = false;
			if (node.text === formatter) {
				const parent = node.parent;
				if (is.isImportSpecifier(parent) && parent.name === node) {
					// The binding was checked above.
				} else if (is.isCallExpression(parent) && parent.expression === node) {
					const code = parent.arguments[0];
					const raw = code && is.isNumericLiteral(code) ? code.getText(sourceFile) : '';
					const entry = catalog.codes[raw];
					if (
						parent.questionDotToken ||
						parent.typeArguments ||
						parent.arguments.length !== 1 ||
						!Number.isSafeInteger(Number(raw)) ||
						Number(raw) < 1 ||
						String(Number(raw)) !== raw ||
						!entry ||
						entry.status !== 'active' ||
						entry.argumentCount !== 0 ||
						!entry.runtime.includes(runtime) ||
						(surface === 'shared' && !entry.runtime.includes('server'))
					) {
						safe = false;
					} else {
						calls.push({ call: parent, code: raw, message: entry.message });
					}
				} else {
					safe = false;
				}
			}
		}
		node.forEachChild(scan);
	}
	scan(sourceFile);
	if (!safe || calls.length === 0) return source;

	// Splice the edits into the authored text, so comments, directives and pure
	// annotations stay where they were; esbuild prints the published module.
	// Each replacement is parenthesized, so it binds like the call it replaces.
	const edits = [
		{
			start: imports[0].getStart(sourceFile),
			end: imports[0].end,
			text: `import { ${SHARED_FORMATTER} as ${HELPER} } from ${JSON.stringify(sharedFormatterSpecifier(filename))};`,
		},
		...calls.map(({ call, code, message }) => ({
			start: call.getStart(sourceFile),
			end: call.end,
			text: `(process.env.NODE_ENV !== 'production' ? ${JSON.stringify(message)} : ${HELPER}(${code}))`,
		})),
	].sort((left, right) => right.start - left.start);
	let specialized = source;
	for (const { start, end, text } of edits) {
		specialized = specialized.slice(0, start) + text + specialized.slice(end);
	}
	return specialized;
}
