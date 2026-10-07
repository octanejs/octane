import { dirname, posix, resolve } from 'node:path';
import ts from 'typescript';
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
	const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
	if (sourceFile.parseDiagnostics.length !== 0) return source;

	const imports = sourceFile.statements.filter((node) => {
		if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false;
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
		!ts.isNamedImports(binding) ||
		binding.elements.length !== 1 ||
		binding.elements[0].isTypeOnly ||
		binding.elements[0].propertyName ||
		binding.elements[0].name.text !== formatter
	) {
		return source;
	}

	let safe = true;
	let calls = 0;
	function scan(node) {
		if (ts.isIdentifier(node)) {
			// A caller-local process binding would change the lookup that used to
			// happen inside the formatter's module. Conservatively skip any module
			// that mentions process, even when that mention is harmless.
			if (node.text === 'process' || node.text === HELPER) safe = false;
			if (node.text === formatter) {
				const parent = node.parent;
				if (ts.isImportSpecifier(parent) && parent.name === node) {
					// The binding was checked above.
				} else if (ts.isCallExpression(parent) && parent.expression === node) {
					const code = parent.arguments[0];
					const raw = code && ts.isNumericLiteral(code) ? code.getText(sourceFile) : '';
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
						calls++;
					}
				} else {
					safe = false;
				}
			}
		}
		ts.forEachChild(node, scan);
	}
	scan(sourceFile);
	if (!safe || calls === 0) return source;

	const factory = ts.factory;
	const sharedImport = factory.createImportDeclaration(
		undefined,
		factory.createImportClause(
			false,
			undefined,
			factory.createNamedImports([
				factory.createImportSpecifier(
					false,
					factory.createIdentifier(SHARED_FORMATTER),
					factory.createIdentifier(HELPER),
				),
			]),
		),
		factory.createStringLiteral(sharedFormatterSpecifier(filename)),
	);
	const result = ts.transform(sourceFile, [
		(context) => {
			const visit = (node) => {
				if (
					ts.isCallExpression(node) &&
					ts.isIdentifier(node.expression) &&
					node.expression.text === formatter
				) {
					const code = node.arguments[0].getText(sourceFile);
					return factory.createConditionalExpression(
						factory.createBinaryExpression(
							factory.createPropertyAccessExpression(
								factory.createPropertyAccessExpression(factory.createIdentifier('process'), 'env'),
								'NODE_ENV',
							),
							factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
							factory.createStringLiteral('production'),
						),
						undefined,
						factory.createStringLiteral(catalog.codes[code].message),
						undefined,
						factory.createCallExpression(factory.createIdentifier(HELPER), undefined, [
							factory.createNumericLiteral(code),
						]),
					);
				}
				return ts.visitEachChild(node, visit, context);
			};
			return (file) => {
				// The shared formatter's import takes the generic formatter's place.
				const statements = file.statements.map((statement) =>
					statement === imports[0] ? sharedImport : ts.visitNode(statement, visit),
				);
				return factory.updateSourceFile(file, statements);
			};
		},
	]);
	try {
		return ts.createPrinter().printFile(result.transformed[0]);
	} finally {
		result.dispose();
	}
}
