import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { frameworkErrorSurface, validateCatalog } from '../../../scripts/error-codes/generate.mjs';
import { formatProdErrorMessage } from '../src/error-message.ts';

const HELPER = '__octaneNoArgError';
const SENTINEL = 8642097531;
const productionParts = formatProdErrorMessage(SENTINEL, []).split(String(SENTINEL));

// Only modules whose formatter binding has exclusively literal, zero-argument
// calls can stop importing the generic formatter. Unknown forms are left alone.
export function specializeErrorCalls(source, filename, catalog) {
	const surface = frameworkErrorSurface(filename);
	if (surface === undefined || productionParts.length !== 3) return source;
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
	const helperCode = factory.createIdentifier('code');
	const productionExpression = productionParts
		.slice(1)
		.reduce(
			(expression, part) =>
				factory.createBinaryExpression(
					factory.createBinaryExpression(
						expression,
						factory.createToken(ts.SyntaxKind.PlusToken),
						helperCode,
					),
					factory.createToken(ts.SyntaxKind.PlusToken),
					factory.createStringLiteral(part),
				),
			factory.createStringLiteral(productionParts[0]),
		);
	const helper = factory.createFunctionDeclaration(
		undefined,
		undefined,
		HELPER,
		undefined,
		[
			factory.createParameterDeclaration(
				undefined,
				undefined,
				helperCode,
				undefined,
				factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
			),
		],
		factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
		factory.createBlock([factory.createReturnStatement(productionExpression)], true),
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
				const statements = file.statements
					.filter((statement) => statement !== imports[0])
					.map((statement) => ts.visitNode(statement, visit));
				let index = 0;
				while (
					index < statements.length &&
					(ts.isImportDeclaration(statements[index]) ||
						(ts.isExpressionStatement(statements[index]) &&
							ts.isStringLiteral(statements[index].expression)))
				)
					index++;
				statements.splice(index, 0, helper);
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

export async function createErrorSpecializationPlugin({ sourceRoot, catalogPath }) {
	const catalog = validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
	return {
		name: 'octane-specialize-no-argument-errors',
		setup(build) {
			build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
				const filename = relative(sourceRoot, path).split(sep).join('/');
				if (filename.startsWith('../') || frameworkErrorSurface(filename) === undefined) return;
				const source = await readFile(path, 'utf8');
				const contents = specializeErrorCalls(source, filename, catalog);
				if (contents !== source) {
					return {
						contents,
						loader: 'ts',
						resolveDir: dirname(path),
						watchFiles: [path, catalogPath],
					};
				}
			});
		},
	};
}
