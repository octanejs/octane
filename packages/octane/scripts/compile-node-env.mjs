import {
	hasModifier,
	hasParseErrors,
	is,
	isReparsed,
	parseSourceFile,
	ScriptKind,
	SyntaxKind,
} from '../../../scripts/octane-tsc/native-syntax.mjs';

// Node evaluates the published runtime unbundled, so nothing substitutes
// process.env.NODE_ENV: every guard crosses into the host environment
// interceptor (~100 ns, against ~1 ns for a local), and a guard evaluated after
// the process global disappears throws a ReferenceError that replaces the
// diagnostic it was formatting. In the trees Node loads (build-runtime.mjs), each
// module therefore reads the environment once, while it evaluates, into a
// module-local boolean.
//
// A bundler can still substitute the one remaining expression. terser, swc,
// rollup, and rolldown then fold the flag and drop the guarded branches; esbuild
// does not inline a top-level const in a module with imports, which is why the
// bundler tree keeps its literal guards.
export const DEVELOPMENT_FLAG = '__octaneDev';
export const DEVELOPMENT_FLAG_DECLARATION = `const ${DEVELOPMENT_FLAG} = process.env.NODE_ENV !== 'production';`;

const EQUALITY = new Map([
	[SyntaxKind.EqualsEqualsEqualsToken, false],
	[SyntaxKind.EqualsEqualsToken, false],
	[SyntaxKind.ExclamationEqualsEqualsToken, true],
	[SyntaxKind.ExclamationEqualsToken, true],
]);

function isEnvironmentRead(node) {
	return (
		is.isPropertyAccessExpression(node) &&
		!node.questionDotToken &&
		node.name.text === 'NODE_ENV' &&
		is.isPropertyAccessExpression(node.expression) &&
		!node.expression.questionDotToken &&
		node.expression.name.text === 'env' &&
		is.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'process'
	);
}

function isProductionLiteral(node) {
	return (
		(is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node)) &&
		node.text === 'production'
	);
}

// A module-local `process` would change what both the bundler and this module
// resolve. Ambient declarations (`declare const process`) only type the global.
function declaresProcess(node) {
	const parent = node.parent;
	if (!parent || parent.name !== node) return false;
	if (is.isVariableDeclaration(parent)) {
		// Only a `declare` on the enclosing variable statement makes a variable ambient.
		const statement = is.isVariableDeclarationList(parent.parent)
			? parent.parent.parent
			: undefined;
		return !(
			statement &&
			is.isVariableStatement(statement) &&
			hasModifier(statement, SyntaxKind.DeclareKeyword)
		);
	}
	return (
		is.isParameterDeclaration(parent) ||
		is.isBindingElement(parent) ||
		is.isFunctionDeclaration(parent) ||
		is.isFunctionExpression(parent) ||
		is.isClassDeclaration(parent) ||
		is.isClassExpression(parent) ||
		is.isImportClause(parent) ||
		is.isImportSpecifier(parent) ||
		is.isNamespaceImport(parent) ||
		is.isImportEqualsDeclaration(parent) ||
		is.isEnumDeclaration(parent)
	);
}

// Rewrites every `process.env.NODE_ENV === 'production'` comparison (either
// operand order, strict or loose, negated or not) to the module flag. Any other
// shape of environment read would keep a live lookup, so it fails the build
// rather than shipping one.
export function compileNodeEnvReads(source, filename) {
	if (!source.includes('NODE_ENV')) return source;
	const sourceFile = parseSourceFile(
		filename,
		source,
		/\.[cm]?js$/.test(filename) ? ScriptKind.JS : ScriptKind.TS,
	);
	if (hasParseErrors(sourceFile)) {
		throw new Error(`${filename}: cannot compile environment reads in a module with parse errors`);
	}
	const fail = (node, reason) => {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		throw new Error(`${filename}:${line + 1}:${character + 1}: ${reason}`);
	};

	const edits = [];
	let shadowed;
	function visit(node) {
		if (isReparsed(node)) return;
		// Types never evaluate, including the ambient `process` declaration's.
		if (is.isTypeNode(node) || is.isInterfaceDeclaration(node) || is.isTypeAliasDeclaration(node)) {
			return;
		}
		if (is.isIdentifier(node)) {
			if (node.text === DEVELOPMENT_FLAG) fail(node, `${DEVELOPMENT_FLAG} is reserved`);
			if (node.text === 'process' && declaresProcess(node)) shadowed ??= node;
			if (node.text === 'NODE_ENV') {
				const read = node.parent;
				const comparison = read.parent;
				if (
					!isEnvironmentRead(read) ||
					read.name !== node ||
					!is.isBinaryExpression(comparison) ||
					!EQUALITY.has(comparison.operatorToken.kind) ||
					!isProductionLiteral(comparison.left === read ? comparison.right : comparison.left)
				) {
					fail(node, "compare process.env.NODE_ENV directly with 'production'");
				}
				edits.push({
					start: comparison.getStart(sourceFile),
					end: comparison.end,
					text: EQUALITY.get(comparison.operatorToken.kind)
						? DEVELOPMENT_FLAG
						: `!${DEVELOPMENT_FLAG}`,
				});
			}
		} else if (
			is.isElementAccessExpression(node) &&
			is.isStringLiteralLikeNode(node.argumentExpression) &&
			node.argumentExpression.text === 'NODE_ENV'
		) {
			fail(node, 'read NODE_ENV as process.env.NODE_ENV');
		}
		node.forEachChild(visit);
	}
	visit(sourceFile);
	if (edits.length === 0) return source;
	if (shadowed) fail(shadowed, 'a module that reads NODE_ENV cannot declare its own process');

	// The flag precedes every other statement, including the leading comments of
	// the first one, so annotations such as @__NO_SIDE_EFFECTS__ stay attached.
	const statements = sourceFile.statements.filter((statement) => !isReparsed(statement));
	let index = 0;
	while (
		index < statements.length &&
		is.isExpressionStatement(statements[index]) &&
		is.isStringLiteral(statements[index].expression)
	) {
		index++;
	}
	const insertAt = index === 0 ? 0 : statements[index - 1].end;
	edits.push({
		start: insertAt,
		end: insertAt,
		text: index === 0 ? `${DEVELOPMENT_FLAG_DECLARATION}\n` : `\n${DEVELOPMENT_FLAG_DECLARATION}`,
	});

	let output = source;
	for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
		output = output.slice(0, start) + text + output.slice(end);
	}
	return output;
}
