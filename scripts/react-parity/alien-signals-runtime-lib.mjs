/**
 * One-for-one pristine/adapted runtime crosswalk for alien-signals.
 * Compares titles, normalized assertion contracts, and fixture integrity
 * under packages/alien-signals/audit/runtime-transformation-ledger.json.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const DISABLED_REGISTRATION =
	/\b(?:fdescribe|fit|xdescribe|xit|xtest)(?:\s*\(|\.each\s*\()|\b(?:describe|it|test)\.(?:failing|fails|only|skip|todo)(?:\s*\(|\.each\s*\()/;

const MATCHER_NAMES = new Set([
	'toBe',
	'toEqual',
	'toHaveBeenCalledTimes',
	'toBeDefined',
	'toBeGreaterThan',
	'toBeNull',
	'toBeUndefined',
]);

export const RUNTIME_TRANSFORMS_LEDGER =
	'packages/alien-signals/audit/runtime-transformation-ledger.json';

export function titlesFromInventory(inventory) {
	return (inventory?.tests ?? [])
		.map(function titleOf(test) {
			return test.fullName;
		})
		.sort();
}

export function describeTitleMismatch(pristineTitles, adaptedTitles) {
	const pristineSet = new Set(pristineTitles);
	const adaptedSet = new Set(adaptedTitles);
	const missing = pristineTitles.filter(function notInAdapted(title) {
		return !adaptedSet.has(title);
	});
	const extra = adaptedTitles.filter(function notInPristine(title) {
		return !pristineSet.has(title);
	});
	const parts = [];
	if (missing.length > 0) parts.push(`missing adapted titles: ${missing.join('; ')}`);
	if (extra.length > 0) parts.push(`extra adapted titles: ${extra.join('; ')}`);
	if (pristineTitles.length !== adaptedTitles.length) {
		parts.push(`count ${adaptedTitles.length} !== pristine ${pristineTitles.length}`);
	}
	return parts.join('; ');
}

function stripSuitePrefix(fullName) {
	return fullName.replace(/^Alien React Library\s+/, '');
}

function isJsonStringifyCall(node) {
	return (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === 'JSON' &&
		ts.isIdentifier(node.expression.name) &&
		node.expression.name.text === 'stringify' &&
		node.arguments[0] !== undefined
	);
}

function evaluateLiteral(node, sourceFile) {
	if (node === undefined) return { kind: 'empty', text: '' };
	if (isJsonStringifyCall(node)) {
		return evaluateLiteral(node.arguments[0], sourceFile);
	}
	if (
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		(typeof ts.isNumericLiteral === 'function' && ts.isNumericLiteral(node)) ||
		ts.isPrefixUnaryExpression(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword ||
		node.kind === ts.SyntaxKind.UndefinedKeyword
	) {
		const text = node.getText(sourceFile).trim();
		try {
			const value = Function(`"use strict"; return (${text});`)();
			return { kind: 'value', value };
		} catch {
			return { kind: 'text', text: text.replace(/\s+/g, '') };
		}
	}
	if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
		const text = node.getText(sourceFile);
		try {
			const value = Function(`"use strict"; return (${text});`)();
			return { kind: 'value', value };
		} catch {
			return { kind: 'text', text: text.replace(/\s+/g, '') };
		}
	}
	if (
		ts.isIdentifier(node) &&
		(node.text === 'undefined' || node.text === 'Infinity' || node.text === 'NaN')
	) {
		return { kind: 'value', value: Function(`"use strict"; return (${node.text});`)() };
	}
	return { kind: 'text', text: node.getText(sourceFile).replace(/\s+/g, '') };
}

function valueKey(value) {
	if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) {
		return JSON.stringify(Number(value));
	}
	if (value === undefined) return 'undefined';
	return JSON.stringify(value);
}

function normalizeContract(matcher, evaluated) {
	if (evaluated.kind === 'empty') return `${matcher}:`;
	if (evaluated.kind === 'text') return `${matcher}:${evaluated.text}`;
	return `${matcher}:${valueKey(evaluated.value)}`;
}

function expandContract(contract) {
	const separator = contract.indexOf(':');
	const matcher = contract.slice(0, separator);
	const payload = contract.slice(separator + 1);
	const expanded = new Set([contract]);
	if (matcher === 'toEqual' || matcher === 'toBe') {
		if (payload === 'undefined' || payload === '"undefined"') {
			expanded.add('toBe:undefined');
			expanded.add('toEqual:undefined');
			expanded.add('toBe:"undefined"');
		}
		if (payload === 'null' || payload === '"null"') {
			expanded.add('toBe:null');
			expanded.add('toEqual:null');
			expanded.add('toBe:"null"');
		}
		try {
			const value = payload === 'undefined' ? undefined : JSON.parse(payload);
			expanded.add(`toBe:${valueKey(value)}`);
			expanded.add(`toEqual:${valueKey(value)}`);
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				const keys = Object.keys(value);
				if (keys.length === 1) {
					expanded.add(`toBe:${valueKey(value[keys[0]])}`);
					expanded.add(`toEqual:${valueKey(value[keys[0]])}`);
				}
				expanded.add(`toBe:${valueKey(JSON.stringify(value))}`);
			}
		} catch {
			// Non-JSON payloads stay as the original contract only.
		}
	}
	return expanded;
}

function callTitle(node) {
	if (!ts.isCallExpression(node)) return null;
	if (!ts.isIdentifier(node.expression)) return null;
	if (node.expression.text !== 'it' && node.expression.text !== 'test') return null;
	const titleNode = node.arguments[0];
	if (!titleNode || !ts.isStringLiteralLike(titleNode)) return null;
	return {
		title: titleNode.text,
		body: node.arguments[1],
		node,
	};
}

function normalizeReceiver(node, sourceFile) {
	if (node === undefined) return 'empty';
	if (
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		(typeof ts.isNumericLiteral === 'function' && ts.isNumericLiteral(node)) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword
	) {
		return `literal:${node.getText(sourceFile).trim()}`;
	}
	if (
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.arguments.length === 0
	) {
		return `call:${node.expression.text}`;
	}
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		const text = node.getText(sourceFile).replace(/\s+/g, '');
		if (text === 'result.current' || /^result\.current\[\d+\]$/.test(text)) return 'surface';
		if (text.endsWith('.textContent')) return 'surface';
	}
	if (ts.isIdentifier(node)) {
		if (node.text === 'undefined') return 'literal:undefined';
		return `id:${node.text}`;
	}
	return `expr:${node.getText(sourceFile).replace(/\s+/g, '')}`;
}

function splitContract(contract) {
	const separator = contract.indexOf('|');
	if (separator === -1) {
		return { receiver: 'legacy', matcherContract: contract };
	}
	return {
		receiver: contract.slice(0, separator),
		matcherContract: contract.slice(separator + 1),
	};
}

function receiversCompatible(pristineReceiver, adaptedReceiver) {
	if (pristineReceiver === adaptedReceiver) return true;
	if (pristineReceiver === 'legacy' || adaptedReceiver === 'legacy') return true;
	if (pristineReceiver.startsWith('call:') || adaptedReceiver.startsWith('call:')) {
		return pristineReceiver === adaptedReceiver;
	}
	if (pristineReceiver.startsWith('literal:') || adaptedReceiver.startsWith('literal:')) {
		return pristineReceiver === adaptedReceiver;
	}
	// assertion-surface: result.current may become DOM textContent or a local stopper/value id
	if (pristineReceiver === 'surface' && adaptedReceiver.startsWith('id:')) return true;
	if (pristineReceiver.startsWith('id:') && adaptedReceiver === 'surface') return true;
	if (pristineReceiver === 'surface' && adaptedReceiver === 'surface') return true;
	if (pristineReceiver.startsWith('id:') && adaptedReceiver.startsWith('id:')) {
		return pristineReceiver === adaptedReceiver;
	}
	return false;
}

const PER_CITATION = /\/\/\s*Per\s+src\/index\.test\.ts:(\d+)\s*$/;

function citationLineForCase(node, sourceFile) {
	const trivia = sourceFile.text.slice(node.getFullStart(), node.getStart(sourceFile));
	const lines = trivia.split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const match = lines[index].trim().match(PER_CITATION);
		if (match) return Number(match[1]);
	}
	return null;
}

export function extractPristineCaseLines(source, fileName = 'pristine.ts') {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const byTitle = new Map();
	function visit(node) {
		const titled = callTitle(node);
		if (titled !== null) {
			const line =
				sourceFile.getLineAndCharacterOfPosition(titled.node.getStart(sourceFile)).line + 1;
			byTitle.set(titled.title, line);
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return byTitle;
}

export function extractCaseAssertionContracts(source, fileName = 'suite.ts') {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const cases = [];
	function visit(node) {
		const titled = callTitle(node);
		if (titled !== null && titled.body) {
			const contracts = [];
			function visitAssertions(assertionNode) {
				if (
					ts.isCallExpression(assertionNode) &&
					ts.isPropertyAccessExpression(assertionNode.expression) &&
					ts.isIdentifier(assertionNode.expression.name) &&
					MATCHER_NAMES.has(assertionNode.expression.name.text)
				) {
					const matcher = assertionNode.expression.name.text;
					const expectCall = assertionNode.expression.expression;
					const receiverNode =
						ts.isCallExpression(expectCall) &&
						ts.isIdentifier(expectCall.expression) &&
						expectCall.expression.text === 'expect'
							? expectCall.arguments[0]
							: undefined;
					const matcherContract = normalizeContract(
						matcher,
						evaluateLiteral(assertionNode.arguments[0], sourceFile),
					);
					contracts.push(`${normalizeReceiver(receiverNode, sourceFile)}|${matcherContract}`);
				}
				ts.forEachChild(assertionNode, visitAssertions);
			}
			visitAssertions(titled.body);
			cases.push({
				title: titled.title,
				contracts,
				citationLine: citationLineForCase(titled.node, sourceFile),
			});
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return cases;
}

export function extractReferencedFixtureIds(adaptedSource) {
	const ids = new Set();
	for (const match of adaptedSource.matchAll(
		/\bresult\.(?:find|click)\(\s*['"]#([A-Za-z0-9_-]+)['"]\s*\)/g,
	)) {
		ids.add(match[1]);
	}
	return [...ids].sort();
}

function isResultCurrentAccess(node) {
	if (ts.isElementAccessExpression(node)) {
		return isResultCurrentAccess(node.expression);
	}
	return (
		ts.isPropertyAccessExpression(node) &&
		ts.isIdentifier(node.expression) &&
		node.expression.text === 'result' &&
		ts.isIdentifier(node.name) &&
		node.name.text === 'current'
	);
}

/**
 * SetterProbe-style lookup from an array that received an authentic
 * record-callback `.push(param)`: `setters.at(-1)` or `setters[i]`.
 */
function isRecordedSetterLookup(node, pushedArrays) {
	let arrayName = null;
	if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
		arrayName = node.expression.text;
	} else if (
		ts.isCallExpression(node) &&
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		ts.isIdentifier(node.expression.name) &&
		node.expression.name.text === 'at'
	) {
		arrayName = node.expression.expression.text;
	}
	return arrayName !== null && pushedArrays.has(arrayName);
}

function functionLikeOf(node) {
	if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
		return node;
	}
	return null;
}

function isTrueLiteral(node) {
	return node !== undefined && node.kind === ts.SyntaxKind.TrueKeyword;
}

function isFalseLiteral(node) {
	return node !== undefined && node.kind === ts.SyntaxKind.FalseKeyword;
}

function isUnconditionalTerminator(statement) {
	return ts.isReturnStatement(statement) || ts.isThrowStatement(statement);
}

/**
 * True when `nameNode` binds the identifier `name` (including nested binding
 * patterns). Used to reject shadowed globals such as a local `Promise`.
 */
function bindingNameDeclares(nameNode, name) {
	if (nameNode === undefined || nameNode === null) return false;
	if (ts.isIdentifier(nameNode)) return nameNode.text === name;
	if (ts.isBindingElement(nameNode)) return bindingNameDeclares(nameNode.name, name);
	if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
		for (const element of nameNode.elements) {
			if (ts.isOmittedExpression(element)) continue;
			if (bindingNameDeclares(element, name)) return true;
		}
	}
	return false;
}

function isVarDeclarationList(list) {
	return (list.flags & ts.NodeFlags.Let) === 0 && (list.flags & ts.NodeFlags.Const) === 0;
}

function isFunctionLikeScope(node) {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node)
	);
}

/**
 * True when `root` contains a function-scoped binding of `name` (`var` or a
 * `function` declaration). Nested function bodies are skipped — their hoisted
 * bindings do not escape into `root`.
 */
function hasHoistedNameBinding(root, name) {
	let found = false;
	function visit(node) {
		if (found) return;
		if (ts.isFunctionDeclaration(node)) {
			if (node.name && node.name.text === name) found = true;
			return;
		}
		if (isFunctionLikeScope(node)) return;
		if (ts.isVariableDeclarationList(node) && isVarDeclarationList(node)) {
			for (const declaration of node.declarations) {
				if (bindingNameDeclares(declaration.name, name)) {
					found = true;
					return;
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(root);
	return found;
}

/**
 * True when `identifier` resolves to a local binding rather than the unshadowed
 * global of the same spelling. Lexical `let`/`const`/`class`/imports are read
 * from enclosing scopes via parent pointers; function-scoped `var`/`function`
 * bindings are deep-scanned in every enclosing function (or the script),
 * stopping once the name resolves — so a nested-block `var Promise` and an
 * outer-function `var Promise` seen from an inner callback both count.
 */
function identifierHasLocalBinding(identifier) {
	const name = identifier.text;
	let scriptScope = null;
	let current = identifier.parent;
	while (current !== undefined && current !== null) {
		if (isFunctionLikeScope(current)) {
			if (current.name && ts.isIdentifier(current.name) && current.name.text === name) {
				return true;
			}
			for (const parameter of current.parameters) {
				if (bindingNameDeclares(parameter.name, name)) return true;
			}
			const hoistedRoot = current.body !== undefined ? current.body : current;
			if (hasHoistedNameBinding(hoistedRoot, name)) return true;
		}

		if (ts.isSourceFile(current)) scriptScope = current;

		if (ts.isCatchClause(current) && current.variableDeclaration) {
			if (bindingNameDeclares(current.variableDeclaration.name, name)) return true;
		}

		if (
			ts.isForStatement(current) ||
			ts.isForInStatement(current) ||
			ts.isForOfStatement(current)
		) {
			const initializer = current.initializer;
			if (initializer && ts.isVariableDeclarationList(initializer)) {
				for (const declaration of initializer.declarations) {
					if (bindingNameDeclares(declaration.name, name)) return true;
				}
			}
		}

		if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isModuleBlock(current)) {
			for (const statement of current.statements) {
				if (ts.isVariableStatement(statement)) {
					// `var` is handled by the per-function hoisted deep-scan.
					if (!isVarDeclarationList(statement.declarationList)) {
						for (const declaration of statement.declarationList.declarations) {
							if (bindingNameDeclares(declaration.name, name)) return true;
						}
					}
				}
				if (ts.isFunctionDeclaration(statement) && statement.name && statement.name.text === name) {
					return true;
				}
				if (ts.isClassDeclaration(statement) && statement.name && statement.name.text === name) {
					return true;
				}
				if (ts.isImportDeclaration(statement) && statement.importClause) {
					const clause = statement.importClause;
					if (clause.name && clause.name.text === name) return true;
					const bindings = clause.namedBindings;
					if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) {
						return true;
					}
					if (bindings && ts.isNamedImports(bindings)) {
						for (const element of bindings.elements) {
							if (element.name.text === name) return true;
						}
					}
				}
			}
		}

		if (ts.isCaseClause(current) || ts.isDefaultClause(current)) {
			for (const statement of current.statements) {
				if (ts.isVariableStatement(statement) && !isVarDeclarationList(statement.declarationList)) {
					for (const declaration of statement.declarationList.declarations) {
						if (bindingNameDeclares(declaration.name, name)) return true;
					}
				}
			}
		}

		current = current.parent;
	}

	return scriptScope !== null && hasHoistedNameBinding(scriptScope, name);
}

/**
 * `Promise.resolve(...)` — the only thenable the suite uses whose fulfillment
 * callback is statically known to run. A bare `.then` property (lookalike
 * sink, rejected Promise, arbitrary thenable) does not authenticate. A local
 * binding that shadows `Promise` also does not — only the unshadowed global.
 */
function isPromiseResolveCall(node) {
	if (!ts.isCallExpression(node)) return false;
	if (!ts.isPropertyAccessExpression(node.expression)) return false;
	if (!ts.isIdentifier(node.expression.expression)) return false;
	if (!ts.isIdentifier(node.expression.name)) return false;
	if (node.expression.expression.text !== 'Promise' || node.expression.name.text !== 'resolve') {
		return false;
	}
	return !identifierHasLocalBinding(node.expression.expression);
}

const AUTHENTICATED_ACT_MODULES = new Set([
	'@testing-library/react',
	'@testing-library/react/pure',
	'react',
	'react-dom/test-utils',
]);

/**
 * True when `identifier` is bound by a named import of the same export spelling
 * from one of `modules` — e.g. `import { act } from '@testing-library/react'`.
 * Default imports, namespace imports, and renames such as
 * `import { cleanup as act }` bind locally but do not authenticate. Any closer
 * local binding (param, var/let/const, function, class) also fails.
 */
function identifierIsNamedImportFrom(identifier, modules) {
	const name = identifier.text;

	function importBindingKind(statement) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause) return null;
		const clause = statement.importClause;
		if (clause.name && clause.name.text === name) return 'local';
		const bindings = clause.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) {
			return 'local';
		}
		if (bindings && ts.isNamedImports(bindings)) {
			for (const element of bindings.elements) {
				if (element.name.text !== name) continue;
				const exportName = element.propertyName ? element.propertyName.text : element.name.text;
				if (exportName !== name) return 'local';
				if (!ts.isStringLiteral(statement.moduleSpecifier)) return 'local';
				return modules.has(statement.moduleSpecifier.text) ? 'auth-import' : 'local';
			}
		}
		return null;
	}

	function bindingKindInStatementList(statements) {
		for (const statement of statements) {
			if (ts.isVariableStatement(statement)) {
				if (!isVarDeclarationList(statement.declarationList)) {
					for (const declaration of statement.declarationList.declarations) {
						if (bindingNameDeclares(declaration.name, name)) return 'local';
					}
				}
			}
			if (ts.isFunctionDeclaration(statement) && statement.name && statement.name.text === name) {
				return 'local';
			}
			if (ts.isClassDeclaration(statement) && statement.name && statement.name.text === name) {
				return 'local';
			}
			const kind = importBindingKind(statement);
			if (kind !== null) return kind;
		}
		return null;
	}

	let scriptScope = null;
	let current = identifier.parent;
	while (current !== undefined && current !== null) {
		if (isFunctionLikeScope(current)) {
			if (current.name && ts.isIdentifier(current.name) && current.name.text === name) {
				return false;
			}
			for (const parameter of current.parameters) {
				if (bindingNameDeclares(parameter.name, name)) return false;
			}
			const hoistedRoot = current.body !== undefined ? current.body : current;
			if (hasHoistedNameBinding(hoistedRoot, name)) return false;
		}

		if (ts.isSourceFile(current)) scriptScope = current;

		if (ts.isCatchClause(current) && current.variableDeclaration) {
			if (bindingNameDeclares(current.variableDeclaration.name, name)) return false;
		}

		if (
			ts.isForStatement(current) ||
			ts.isForInStatement(current) ||
			ts.isForOfStatement(current)
		) {
			const initializer = current.initializer;
			if (initializer && ts.isVariableDeclarationList(initializer)) {
				for (const declaration of initializer.declarations) {
					if (bindingNameDeclares(declaration.name, name)) return false;
				}
			}
		}

		if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isModuleBlock(current)) {
			const kind = bindingKindInStatementList(current.statements);
			if (kind === 'auth-import') return true;
			if (kind === 'local') return false;
		}

		if (ts.isCaseClause(current) || ts.isDefaultClause(current)) {
			for (const statement of current.statements) {
				if (ts.isVariableStatement(statement) && !isVarDeclarationList(statement.declarationList)) {
					for (const declaration of statement.declarationList.declarations) {
						if (bindingNameDeclares(declaration.name, name)) return false;
					}
				}
			}
		}

		current = current.parent;
	}

	if (scriptScope !== null && hasHoistedNameBinding(scriptScope, name)) return false;
	return false;
}

/**
 * `act(callback)` from Testing Library / React — only when `act` is a named
 * import from a known module. A local no-op `act` (or import from elsewhere)
 * does not authenticate nested writes.
 */
function isAuthenticatedActCall(call) {
	if (!ts.isIdentifier(call.expression)) return false;
	if (call.expression.text !== 'act') return false;
	return identifierIsNamedImportFrom(call.expression, AUTHENTICATED_ACT_MODULES);
}

/**
 * Argument indexes whose function-valued callbacks are always executed for a
 * modeled callee. Unlisted callees (e.g. a no-op `sink(fn)` or
 * `{ then(_cb) {} }.then(fn)`) never enter callback bodies — only IIFEs and
 * these forms authenticate nested writes.
 *
 * - `Promise.resolve(...).then(onFulfilled, onRejected?)` — fulfillment only
 *   (rejection and non-resolve receivers are not always-executed).
 * - `act(callback)` — React Testing Library / ReactDOM act runs the callback
 *   synchronously (or awaits an async callback); pristine hook-surface writes
 *   live inside these. Local lookalike `act` bindings do not authenticate.
 */
function alwaysExecutedCallbackArgIndexes(call) {
	if (
		ts.isPropertyAccessExpression(call.expression) &&
		ts.isIdentifier(call.expression.name) &&
		call.expression.name.text === 'then' &&
		isPromiseResolveCall(call.expression.expression)
	) {
		return [0];
	}
	if (isAuthenticatedActCall(call)) {
		return [0];
	}
	return null;
}

/**
 * Visit nodes on the always-executed entry path of `root`.
 *
 * Skips dead `if (false)` / `false &&` arms, statements after `return`/`throw`,
 * loop / switch / catch bodies (not proven to run), for-loop incrementors
 * (post-body only), and nested function bodies that are not IIFEs or explicitly
 * modeled callees (imported `act(fn)`, `Promise.resolve(...).then(fn)`).
 * Arbitrary `sink(fn)` / `map(fn)` / lookalike `.then(fn)` / local `act(fn)`
 * arguments are not treated as always executed. A nested function's
 * `return`/`throw` only stops that function body. Unknown statement shapes
 * authenticate nothing rather than recursively crediting every child.
 */
function forEachAlwaysExecutedNode(root, visitNode) {
	function visitFunctionBody(fn) {
		if (fn.body === undefined) return;
		if (ts.isBlock(fn.body)) {
			visitStatementList(fn.body.statements);
			return;
		}
		visitExpression(fn.body, 'value');
	}

	function visitExpression(node, context) {
		if (node === undefined || node === null) return;
		visitNode(node);

		const asFunction = functionLikeOf(node);
		if (asFunction !== null) {
			if (context === 'call-arg' || context === 'iife') {
				visitFunctionBody(asFunction);
			}
			return;
		}

		if (ts.isParenthesizedExpression(node)) {
			visitExpression(node.expression, context);
			return;
		}

		if (ts.isBinaryExpression(node)) {
			if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
				visitExpression(node.left, 'value');
				if (!isFalseLiteral(node.left)) visitExpression(node.right, 'value');
				return;
			}
			if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
				visitExpression(node.left, 'value');
				if (!isTrueLiteral(node.left)) visitExpression(node.right, 'value');
				return;
			}
		}

		if (ts.isConditionalExpression(node)) {
			visitExpression(node.condition, 'value');
			if (isTrueLiteral(node.condition)) {
				visitExpression(node.whenTrue, 'value');
			} else if (isFalseLiteral(node.condition)) {
				visitExpression(node.whenFalse, 'value');
			}
			return;
		}

		const call = callExpressionOf(node);
		if (call !== null) {
			const calleeFn = functionLikeOf(call.expression);
			if (calleeFn !== null) {
				visitExpression(call.expression, 'iife');
			} else {
				visitExpression(call.expression, 'value');
			}
			const callbackIndexes = alwaysExecutedCallbackArgIndexes(call);
			for (let index = 0; index < call.arguments.length; index += 1) {
				const enterCallback = callbackIndexes !== null && callbackIndexes.indexOf(index) !== -1;
				visitExpression(call.arguments[index], enterCallback ? 'call-arg' : 'value');
			}
			return;
		}

		ts.forEachChild(node, function visitChild(child) {
			if (functionLikeOf(child) !== null) return;
			if (ts.isStatement(child) && !ts.isBlock(child)) return;
			visitExpression(child, 'value');
		});
	}

	function visitStatement(statement) {
		visitNode(statement);

		if (ts.isBlock(statement)) {
			return visitStatementList(statement.statements);
		}

		if (ts.isIfStatement(statement)) {
			visitExpression(statement.expression, 'value');
			if (isTrueLiteral(statement.expression)) {
				return visitStatement(statement.thenStatement);
			}
			if (isFalseLiteral(statement.expression)) {
				if (statement.elseStatement !== undefined) return visitStatement(statement.elseStatement);
			}
			return false;
		}

		if (ts.isExpressionStatement(statement)) {
			visitExpression(statement.expression, 'value');
			return false;
		}

		if (ts.isReturnStatement(statement)) {
			if (statement.expression !== undefined) visitExpression(statement.expression, 'value');
			return true;
		}

		if (ts.isThrowStatement(statement)) {
			visitExpression(statement.expression, 'value');
			return true;
		}

		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				visitNode(declaration);
				if (declaration.initializer !== undefined) {
					visitExpression(declaration.initializer, 'value');
				}
			}
			return false;
		}

		if (ts.isLabeledStatement(statement)) {
			return visitStatement(statement.statement);
		}

		if (ts.isWhileStatement(statement) || ts.isDoStatement(statement)) {
			visitExpression(statement.expression, 'value');
			return false;
		}

		if (ts.isForStatement(statement)) {
			// Initializer + condition run before the first iteration attempt.
			// The incrementor only runs after a successful body iteration, so
			// it is not always-executed (e.g. `for (; false; props.record(s))`).
			if (statement.initializer !== undefined) {
				if (ts.isVariableDeclarationList(statement.initializer)) {
					for (const declaration of statement.initializer.declarations) {
						visitNode(declaration);
						if (declaration.initializer !== undefined) {
							visitExpression(declaration.initializer, 'value');
						}
					}
				} else {
					visitExpression(statement.initializer, 'value');
				}
			}
			if (statement.condition !== undefined) visitExpression(statement.condition, 'value');
			return false;
		}

		if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
			if (ts.isVariableDeclarationList(statement.initializer)) {
				for (const declaration of statement.initializer.declarations) {
					visitNode(declaration);
				}
			} else {
				visitExpression(statement.initializer, 'value');
			}
			visitExpression(statement.expression, 'value');
			return false;
		}

		if (ts.isSwitchStatement(statement)) {
			visitExpression(statement.expression, 'value');
			return false;
		}

		if (ts.isTryStatement(statement)) {
			visitStatement(statement.tryBlock);
			if (statement.finallyBlock !== undefined) visitStatement(statement.finallyBlock);
			return false;
		}

		// Conservatively authenticate nothing for unknown statement shapes
		// (including catch-only paths already skipped above).
		return false;
	}

	function visitStatementList(statements) {
		for (const statement of statements) {
			if (visitStatement(statement)) return true;
		}
		return false;
	}

	visitNode(root);
	const rootFn = functionLikeOf(root);
	if (rootFn !== null) {
		visitFunctionBody(rootFn);
		return;
	}
	if (ts.isBlock(root)) {
		visitStatementList(root.statements);
		return;
	}
	visitExpression(root, 'value');
}

function firstParameterName(fn) {
	if (fn === null || fn.parameters.length === 0) return null;
	const name = fn.parameters[0].name;
	return ts.isIdentifier(name) ? name.text : null;
}

/**
 * Normalize `.tsrx` fixture source so TypeScript can parse the component bodies
 * as TSX (`function f() @{ … }` → `function f() { … }`).
 */
function parseFixtureSource(fixtureSource, fileName = 'hooks.tsx') {
	const normalized = fixtureSource.replace(/@\{/g, '{');
	return ts.createSourceFile(fileName, normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function collectUseSignalSetterNames(fnBody) {
	const setters = new Set();
	function visit(node) {
		if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isCallExpression(node.initializer) &&
			ts.isIdentifier(node.initializer.expression) &&
			node.initializer.expression.text === 'useSignal' &&
			ts.isArrayBindingPattern(node.name) &&
			node.name.elements.length >= 2
		) {
			const setterElement = node.name.elements[1];
			if (
				setterElement &&
				!ts.isOmittedExpression(setterElement) &&
				ts.isBindingElement(setterElement) &&
				ts.isIdentifier(setterElement.name)
			) {
				setters.add(setterElement.name.text);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(fnBody);
	return setters;
}

function collectHookReturnedSetterNames(fnBody) {
	const setters = collectUseSignalSetterNames(fnBody);
	function visit(node) {
		if (
			ts.isVariableDeclaration(node) &&
			node.initializer &&
			ts.isCallExpression(node.initializer) &&
			ts.isIdentifier(node.initializer.expression) &&
			node.initializer.expression.text === 'useSetSignal' &&
			ts.isIdentifier(node.name)
		) {
			setters.add(node.name.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(fnBody);
	return setters;
}

function normalizeUpdateShape(expression, sourceFile) {
	if (expression === undefined || expression === null) return 'none';
	const fn = functionLikeOf(expression);
	if (fn !== null) {
		const params = [];
		for (const parameter of fn.parameters) {
			if (ts.isIdentifier(parameter.name)) params.push(parameter.name.text);
		}
		let bodyText = fn.body.getText(sourceFile);
		for (let index = 0; index < params.length; index++) {
			bodyText = bodyText.replace(new RegExp(`\\b${params[index]}\\b`, 'g'), `$${index}`);
		}
		return `fn:${bodyText.replace(/\s+/g, '')}`;
	}
	return `val:${expression.getText(sourceFile).replace(/\s+/g, '')}`;
}

function isPropsSourceCall(call) {
	return (
		ts.isPropertyAccessExpression(call.expression) &&
		ts.isIdentifier(call.expression.expression) &&
		call.expression.expression.text === 'props' &&
		ts.isIdentifier(call.expression.name) &&
		call.expression.name.text === 'source'
	);
}

/**
 * Count only top-level setter CallExpressions that are the entire statement /
 * expression-body value. Short-circuit / ternary padding cannot inflate the
 * count. Any `props.source(...)` write anywhere in the handler (except nested
 * function bodies) disqualifies authentication.
 */
function collectAuthenticatedHandlerSetterInvocations(expression, names, sourceFile) {
	const shapes = [];
	let hasDirectSourceWrite = false;

	function scanForDirectSourceWrite(node, rootExpression) {
		if (functionLikeOf(node) !== null && node !== rootExpression) {
			return;
		}
		const call = callExpressionOf(node);
		if (call !== null && isPropsSourceCall(call) && call.arguments.length > 0) {
			hasDirectSourceWrite = true;
			return;
		}
		ts.forEachChild(node, function visitChild(child) {
			if (!hasDirectSourceWrite) scanForDirectSourceWrite(child, rootExpression);
		});
	}

	function countTopLevelSetterCall(node) {
		const call = callExpressionOf(node);
		if (call === null || call.arguments.length === 0) return;
		const root = calleeRootIdentifier(call.expression);
		if (root !== null && names.has(root)) {
			shapes.push(normalizeUpdateShape(call.arguments[0], sourceFile));
		}
	}

	function visitAlwaysExecutedStatement(statement) {
		if (ts.isExpressionStatement(statement)) {
			countTopLevelSetterCall(statement.expression);
			return;
		}
		if (ts.isReturnStatement(statement) && statement.expression !== undefined) {
			countTopLevelSetterCall(statement.expression);
		}
	}

	const fn = functionLikeOf(expression);
	if (fn === null) {
		scanForDirectSourceWrite(expression, expression);
		countTopLevelSetterCall(expression);
		return { shapes: hasDirectSourceWrite ? [] : shapes, hasDirectSourceWrite };
	}
	if (fn.body === undefined) {
		return { shapes: [], hasDirectSourceWrite: false };
	}
	scanForDirectSourceWrite(fn, fn);
	if (!ts.isBlock(fn.body)) {
		countTopLevelSetterCall(fn.body);
		return { shapes: hasDirectSourceWrite ? [] : shapes, hasDirectSourceWrite };
	}
	for (const statement of fn.body.statements) {
		visitAlwaysExecutedStatement(statement);
		// Post-return / post-throw padding must not authenticate extra writes.
		if (isUnconditionalTerminator(statement)) break;
	}
	return { shapes: hasDirectSourceWrite ? [] : shapes, hasDirectSourceWrite };
}

function jsxAttributeInitializer(attribute) {
	if (attribute.initializer === undefined) return null;
	if (
		ts.isStringLiteral(attribute.initializer) ||
		ts.isNoSubstitutionTemplateLiteral(attribute.initializer)
	) {
		return attribute.initializer;
	}
	if (ts.isJsxExpression(attribute.initializer)) {
		return attribute.initializer.expression ?? null;
	}
	return null;
}

function elementIdFromJsxAttributes(attributes) {
	for (const attribute of attributes.properties) {
		if (
			!ts.isJsxAttribute(attribute) ||
			!ts.isIdentifier(attribute.name) ||
			attribute.name.text !== 'id'
		) {
			continue;
		}
		const value = jsxAttributeInitializer(attribute);
		if (
			value !== null &&
			(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
		) {
			return value.text;
		}
	}
	return null;
}

function onClickExpressionFromJsxAttributes(attributes) {
	for (const attribute of attributes.properties) {
		if (
			!ts.isJsxAttribute(attribute) ||
			!ts.isIdentifier(attribute.name) ||
			attribute.name.text !== 'onClick'
		) {
			continue;
		}
		return jsxAttributeInitializer(attribute);
	}
	return null;
}

/**
 * Fixtures that call `props.record(<useSignal setter>)` — the SetterProbe /
 * EffectAndSignal handler path. Only these may authenticate recorded setters.
 * Derived from the parsed fixture AST so comments and decoy text cannot qualify.
 */
export function extractFixturesThatRecordHookSetters(fixtureSource) {
	const names = new Set();
	if (!fixtureSource) return names;
	const sourceFile = parseFixtureSource(fixtureSource);
	for (const statement of sourceFile.statements) {
		if (
			!ts.isFunctionDeclaration(statement) ||
			statement.name === undefined ||
			statement.body === undefined
		) {
			continue;
		}
		const setters = collectUseSignalSetterNames(statement.body);
		if (setters.size === 0) continue;
		let recordsHookSetter = false;
		forEachAlwaysExecutedNode(statement.body, function visitExecuted(node) {
			if (recordsHookSetter) return;
			const call = callExpressionOf(node);
			if (
				call !== null &&
				ts.isPropertyAccessExpression(call.expression) &&
				ts.isIdentifier(call.expression.expression) &&
				call.expression.expression.text === 'props' &&
				ts.isIdentifier(call.expression.name) &&
				call.expression.name.text === 'record' &&
				call.arguments.length > 0 &&
				ts.isIdentifier(call.arguments[0]) &&
				setters.has(call.arguments[0].text)
			) {
				recordsHookSetter = true;
			}
		});
		if (recordsHookSetter) names.add(statement.name.text);
	}
	return names;
}

/**
 * Per-fixture element ids whose onClick handlers invoke a hook-returned setter
 * (`useSignal` / `useSetSignal`), with the authenticated setter-invocation count
 * and normalized update shapes inside that handler. Only always-executed handler
 * statements count; dead branches, nested unused functions, and handlers that
 * also write `props.source(...)` do not authenticate. A single click that queues
 * two functional updates contributes two hook-path writes, not one.
 */
export function extractFixtureHookSetterClickIds(fixtureSource) {
	const byFixture = new Map();
	if (!fixtureSource) return byFixture;
	const sourceFile = parseFixtureSource(fixtureSource);
	for (const statement of sourceFile.statements) {
		if (
			!ts.isFunctionDeclaration(statement) ||
			statement.name === undefined ||
			statement.body === undefined
		) {
			continue;
		}
		const setters = collectHookReturnedSetterNames(statement.body);
		const ids = new Map();
		if (setters.size > 0) {
			function visit(node) {
				if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
					const id = elementIdFromJsxAttributes(node.attributes);
					const onClick = onClickExpressionFromJsxAttributes(node.attributes);
					if (id !== null && onClick !== null) {
						let shapes = [];
						if (ts.isIdentifier(onClick) && setters.has(onClick.text)) {
							// Bare setter reference as the handler: one invocation per click,
							// argument shape unknown until event time.
							shapes = ['fn:event'];
						} else {
							shapes = collectAuthenticatedHandlerSetterInvocations(
								onClick,
								setters,
								sourceFile,
							).shapes;
						}
						if (shapes.length > 0) {
							ids.set(id, { writes: shapes.length, shapes });
						}
					}
				}
				ts.forEachChild(node, visit);
			}
			visit(statement.body);
		}
		byFixture.set(statement.name.text, ids);
	}
	return byFixture;
}

function clickSelectorId(call) {
	if (call.arguments.length === 0) return null;
	const arg = call.arguments[0];
	if (!ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) return null;
	const text = arg.text;
	return text.startsWith('#') ? text.slice(1) : text;
}

function mountFixtureName(call) {
	if (call.arguments.length === 0 || !ts.isIdentifier(call.arguments[0])) return null;
	return call.arguments[0].text;
}

function collectFunctionBindings(body) {
	const bindings = new Map();
	function visit(node) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			bindings.set(node.name.text, node);
		}
		if (
			ts.isVariableDeclaration(node) &&
			node.name &&
			ts.isIdentifier(node.name) &&
			node.initializer
		) {
			const fn = functionLikeOf(node.initializer);
			if (fn !== null) bindings.set(node.name.text, fn);
		}
		ts.forEachChild(node, visit);
	}
	visit(body);
	return bindings;
}

function recordPropFromMount(call) {
	if (call.arguments.length < 2 || !ts.isObjectLiteralExpression(call.arguments[1])) {
		return null;
	}
	for (const prop of call.arguments[1].properties) {
		if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'record') {
			return { kind: 'ref', name: prop.name.text };
		}
		if (
			ts.isPropertyAssignment(prop) &&
			ts.isIdentifier(prop.name) &&
			prop.name.text === 'record'
		) {
			if (ts.isIdentifier(prop.initializer)) {
				return { kind: 'ref', name: prop.initializer.text };
			}
			const fn = functionLikeOf(prop.initializer);
			if (fn !== null) return { kind: 'inline', fn };
		}
	}
	return null;
}

/**
 * Arrays that received `.push(<record-callback-param>)` inside a `record`
 * handler passed to a fixture that records the useSignal setter. Pushing the
 * source signal, a no-op, or any other value does not qualify.
 */
function collectAuthenticRecordedSetterArrays(caseBody, recordSetterFixtures) {
	const arrays = new Set();
	const bindings = collectFunctionBindings(caseBody);

	function markPushesOfParam(fn, paramName) {
		if (fn.body === undefined) return;
		const candidateArrays = new Set();
		const taintedArrays = new Set();
		forEachAlwaysExecutedNode(fn, function visitExecuted(node) {
			const call = callExpressionOf(node);
			if (
				call === null ||
				!ts.isPropertyAccessExpression(call.expression) ||
				!ts.isIdentifier(call.expression.expression) ||
				!ts.isIdentifier(call.expression.name) ||
				call.expression.name.text !== 'push' ||
				call.arguments.length === 0
			) {
				return;
			}
			const arrayName = call.expression.expression.text;
			const argument = call.arguments[0];
			if (ts.isIdentifier(argument) && argument.text === paramName) {
				candidateArrays.add(arrayName);
				return;
			}
			// A live competing push (source signal, no-op, etc.) disqualifies the array.
			taintedArrays.add(arrayName);
		});
		for (const arrayName of candidateArrays) {
			if (!taintedArrays.has(arrayName)) arrays.add(arrayName);
		}
	}

	forEachAlwaysExecutedNode(caseBody, function visitExecuted(node) {
		const call = callExpressionOf(node);
		if (
			call !== null &&
			ts.isIdentifier(call.expression) &&
			call.expression.text === 'mount' &&
			call.arguments[0] &&
			ts.isIdentifier(call.arguments[0]) &&
			recordSetterFixtures.has(call.arguments[0].text)
		) {
			const recordProp = recordPropFromMount(call);
			if (recordProp !== null) {
				const fn =
					recordProp.kind === 'inline' ? recordProp.fn : (bindings.get(recordProp.name) ?? null);
				const paramName = firstParameterName(fn);
				if (fn !== null && paramName !== null) markPushesOfParam(fn, paramName);
			}
		}
	});
	return arrays;
}

function collectBindingNames(nameNode, into) {
	if (ts.isIdentifier(nameNode)) {
		into.add(nameNode.text);
		return;
	}
	if (ts.isArrayBindingPattern(nameNode) || ts.isObjectBindingPattern(nameNode)) {
		for (const element of nameNode.elements) {
			if (ts.isBindingElement(element)) collectBindingNames(element.name, into);
		}
	}
}

function callExpressionOf(node) {
	if (ts.isCallExpression(node)) return node;
	if (typeof ts.isOptionalCallExpression === 'function' && ts.isOptionalCallExpression(node)) {
		return node;
	}
	return null;
}

function calleeRootIdentifier(expression) {
	let current = expression;
	while (
		ts.isPropertyAccessExpression(current) ||
		ts.isElementAccessExpression(current) ||
		(typeof ts.isNonNullExpression === 'function' && ts.isNonNullExpression(current)) ||
		(typeof ts.isParenthesizedExpression === 'function' && ts.isParenthesizedExpression(current))
	) {
		current = current.expression;
	}
	if (
		typeof ts.isOptionalChain === 'function' &&
		ts.isOptionalChain(current) &&
		'expression' in current
	) {
		return calleeRootIdentifier(current.expression);
	}
	return ts.isIdentifier(current) ? current.text : null;
}

/**
 * Per-case transition shape for the harness/fixture ledger rule:
 * pristine hook-surface setter writes (result.current / aliases) must remain
 * hook-path transitions in adapted (authenticated fixture clicks or recorded
 * setter calls), not silent direct createSignal writes.
 *
 * When `recordSetterFixtures` is provided, recorded-setter aliases count only
 * for arrays that received `.push(<record-callback-param>)` from a `record`
 * handler mounted on one of those fixtures.
 *
 * When `fixtureHookSetterClicks` is provided, `mountResult.click('#id')` counts
 * the authenticated setter invocations (and their normalized update shapes)
 * inside that fixture handler — not one write per click.
 */
export function extractCaseTransitionStructure(
	source,
	fileName = 'suite.ts',
	{ recordSetterFixtures = null, fixtureHookSetterClicks = null } = {},
) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const cases = [];
	function visit(node) {
		const titled = callTitle(node);
		if (titled !== null && titled.body) {
			const signalBindings = new Set();
			const hookAliases = new Set();
			const mountBindings = new Map();
			const pushedArrays =
				recordSetterFixtures === null
					? new Set()
					: collectAuthenticRecordedSetterArrays(titled.body, recordSetterFixtures);
			const recordedSetterAliases = new Set();
			let hookSurfaceWrites = 0;
			let fixtureClicks = 0;
			let directSourceWrites = 0;
			let recordedSetterWrites = 0;
			const hookSurfaceShapes = [];
			const hookPathShapes = [];

			function observeExecutedNode(bodyNode) {
				if (ts.isVariableDeclaration(bodyNode) && bodyNode.initializer && bodyNode.name) {
					if (
						ts.isCallExpression(bodyNode.initializer) &&
						ts.isIdentifier(bodyNode.initializer.expression) &&
						bodyNode.initializer.expression.text === 'createSignal'
					) {
						collectBindingNames(bodyNode.name, signalBindings);
					}
					if (isResultCurrentAccess(bodyNode.initializer)) {
						collectBindingNames(bodyNode.name, hookAliases);
					}
					if (isRecordedSetterLookup(bodyNode.initializer, pushedArrays)) {
						collectBindingNames(bodyNode.name, recordedSetterAliases);
					}
					const mountCall = callExpressionOf(bodyNode.initializer);
					if (
						mountCall !== null &&
						ts.isIdentifier(mountCall.expression) &&
						mountCall.expression.text === 'mount' &&
						ts.isIdentifier(bodyNode.name)
					) {
						const fixtureName = mountFixtureName(mountCall);
						if (fixtureName !== null) mountBindings.set(bodyNode.name.text, fixtureName);
					}
				}

				const call = callExpressionOf(bodyNode);
				if (call === null) return;
				const expression = call.expression;
				if (
					ts.isPropertyAccessExpression(expression) &&
					ts.isIdentifier(expression.expression) &&
					ts.isIdentifier(expression.name) &&
					expression.name.text === 'click'
				) {
					const fixtureName = mountBindings.get(expression.expression.text);
					const selectorId = clickSelectorId(call);
					if (
						fixtureName !== undefined &&
						selectorId !== null &&
						fixtureHookSetterClicks !== null
					) {
						const authenticated = fixtureHookSetterClicks.get(fixtureName);
						const clickMeta =
							authenticated !== undefined ? authenticated.get(selectorId) : undefined;
						if (clickMeta !== undefined) {
							fixtureClicks += clickMeta.writes;
							for (const shape of clickMeta.shapes) hookPathShapes.push(shape);
						}
					}
				} else if (isResultCurrentAccess(expression) && call.arguments.length > 0) {
					hookSurfaceWrites += 1;
					hookSurfaceShapes.push(normalizeUpdateShape(call.arguments[0], sourceFile));
				} else {
					const root = calleeRootIdentifier(expression);
					if (root !== null && call.arguments.length > 0) {
						if (hookAliases.has(root)) {
							hookSurfaceWrites += 1;
							hookSurfaceShapes.push(normalizeUpdateShape(call.arguments[0], sourceFile));
						} else if (signalBindings.has(root)) {
							directSourceWrites += 1;
						} else if (recordedSetterAliases.has(root)) {
							recordedSetterWrites += 1;
							hookPathShapes.push(normalizeUpdateShape(call.arguments[0], sourceFile));
						}
					}
				}
			}
			forEachAlwaysExecutedNode(titled.body, observeExecutedNode);
			cases.push({
				title: titled.title,
				hookSurfaceWrites,
				fixtureClicks,
				directSourceWrites,
				recordedSetterWrites,
				hookPathWrites: fixtureClicks + recordedSetterWrites,
				hookSurfaceShapes,
				hookPathShapes,
			});
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return cases;
}

export function assertPerCaseTransitionStructure(pristineSource, adaptedSource, fixtureSource) {
	const recordSetterFixtures = extractFixturesThatRecordHookSetters(fixtureSource ?? '');
	const fixtureHookSetterClicks = extractFixtureHookSetterClickIds(fixtureSource ?? '');
	const pristineCases = extractCaseTransitionStructure(pristineSource, 'pristine.ts');
	const adaptedCases = extractCaseTransitionStructure(adaptedSource, 'adapted.ts', {
		recordSetterFixtures,
		fixtureHookSetterClicks,
	});
	const adaptedByTitle = new Map(
		adaptedCases.map(function entryOf(caseEntry) {
			return [caseEntry.title, caseEntry];
		}),
	);
	for (const pristineCase of pristineCases) {
		if (pristineCase.hookSurfaceWrites === 0) continue;
		const adaptedCase = adaptedByTitle.get(pristineCase.title);
		if (adaptedCase === undefined) {
			throw new Error(
				`alien-signals runtime transition crosswalk missing adapted case: ${pristineCase.title}`,
			);
		}
		// Authenticated clicks contribute their in-handler setter-invocation count
		// (and shapes). Collapsing two queued functional updates into one write —
		// even when the final DOM value still matches — is a bypass.
		const underCovered = adaptedCase.hookPathWrites < pristineCase.hookSurfaceWrites;
		const pristineShapes = [...pristineCase.hookSurfaceShapes].sort();
		const adaptedShapes = [...adaptedCase.hookPathShapes].sort();
		const shapeMismatch = JSON.stringify(pristineShapes) !== JSON.stringify(adaptedShapes);
		if (underCovered || shapeMismatch) {
			throw new Error(
				`alien-signals adapted case "${pristineCase.title}" bypasses ${pristineCase.hookSurfaceWrites} hook-surface transition(s) with direct source mutation (${adaptedCase.directSourceWrites} direct write(s), ${adaptedCase.fixtureClicks} authenticated setter write(s) from clicks, ${adaptedCase.recordedSetterWrites} recorded setter write(s)); keep hook-driven interactions under the transformation ledger`,
			);
		}
	}
	return {
		pristineHookSurfaceCases: pristineCases.filter(function hasHook(caseEntry) {
			return caseEntry.hookSurfaceWrites > 0;
		}).length,
	};
}

export function extractFixtureElementIds(fixtureSource) {
	const ids = new Set();
	for (const match of fixtureSource.matchAll(/\bid\s*=\s*["']([A-Za-z0-9_-]+)["']/g)) {
		ids.add(match[1]);
	}
	return [...ids].sort();
}

export function extractMountedFixtures(adaptedSource, fileName = 'adapted.ts') {
	const sourceFile = ts.createSourceFile(
		fileName,
		adaptedSource,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const fixtures = new Set();
	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'mount' &&
			node.arguments[0] &&
			ts.isIdentifier(node.arguments[0])
		) {
			fixtures.add(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return [...fixtures].sort();
}

export function fixtureExportNames(fixtureSource) {
	return [...fixtureSource.matchAll(/^export\s+function\s+([A-Za-z0-9_]+)/gm)]
		.map(function nameOf(match) {
			return match[1];
		})
		.sort();
}

export function fixtureFileFingerprint(fixtureSource) {
	return createHash('sha256').update(fixtureSource.replace(/\r\n/g, '\n')).digest('hex');
}

function contractsCovered(pristineContracts, adaptedContracts) {
	const remaining = adaptedContracts.slice();
	for (const pristineContract of pristineContracts) {
		const pristineParts = splitContract(pristineContract);
		const candidates = expandContract(pristineParts.matcherContract);
		const index = remaining.findIndex(function matches(adaptedContract) {
			const adaptedParts = splitContract(adaptedContract);
			if (!receiversCompatible(pristineParts.receiver, adaptedParts.receiver)) return false;
			const adaptedExpanded = expandContract(adaptedParts.matcherContract);
			for (const candidate of candidates) {
				if (adaptedExpanded.has(candidate)) return true;
			}
			return false;
		});
		if (index === -1) return false;
		remaining.splice(index, 1);
	}
	return true;
}

export function assertRuntimeStructureCrosswalk({
	pristineSource,
	adaptedSource,
	fixtureSource,
	ledgerPath = RUNTIME_TRANSFORMS_LEDGER,
	repoRoot,
	expectedFixtureSha256,
} = {}) {
	let recordedFixtureSha256 = expectedFixtureSha256;
	if (repoRoot && ledgerPath) {
		const ledger = JSON.parse(readFileSync(resolve(repoRoot, ledgerPath), 'utf8'));
		if (
			!Array.isArray(ledger.permittedTransformations) ||
			ledger.permittedTransformations.length === 0
		) {
			throw new Error('runtime transformation ledger is missing permittedTransformations');
		}
		if (recordedFixtureSha256 === undefined) {
			recordedFixtureSha256 = ledger.fixtureFileSha256;
		}
	}
	const pristineCases = extractCaseAssertionContracts(pristineSource, 'pristine.ts');
	const adaptedCases = extractCaseAssertionContracts(adaptedSource, 'adapted.ts');
	const pristineLines = extractPristineCaseLines(pristineSource, 'pristine.ts');
	const adaptedByTitle = new Map(
		adaptedCases.map(function entryOf(caseEntry) {
			return [caseEntry.title, caseEntry];
		}),
	);
	for (const pristineCase of pristineCases) {
		const adaptedCase = adaptedByTitle.get(pristineCase.title);
		if (adaptedCase === undefined) {
			throw new Error(
				`alien-signals runtime structure crosswalk missing adapted case: ${pristineCase.title}`,
			);
		}
		if (adaptedCase.citationLine === null) {
			throw new Error(
				`alien-signals adapted case "${pristineCase.title}" is missing a // Per src/index.test.ts:<line> citation`,
			);
		}
		const expectedLine = pristineLines.get(pristineCase.title);
		if (expectedLine !== undefined && adaptedCase.citationLine !== expectedLine) {
			throw new Error(
				`alien-signals adapted case "${pristineCase.title}" cites line ${adaptedCase.citationLine} but pristine title is at line ${expectedLine}`,
			);
		}
		if (!contractsCovered(pristineCase.contracts, adaptedCase.contracts)) {
			throw new Error(
				`alien-signals runtime assertion drift in "${pristineCase.title}": pristine contracts ${JSON.stringify(pristineCase.contracts)} are not covered by adapted contracts ${JSON.stringify(adaptedCase.contracts)}`,
			);
		}
	}
	const transitions = assertPerCaseTransitionStructure(
		pristineSource,
		adaptedSource,
		fixtureSource,
	);
	const mounted = extractMountedFixtures(adaptedSource);
	const exports = new Set(fixtureExportNames(fixtureSource));
	for (const fixtureName of mounted) {
		if (!exports.has(fixtureName)) {
			throw new Error(`alien-signals adapted suite mounts missing fixture export: ${fixtureName}`);
		}
	}
	if (mounted.length === 0) {
		throw new Error('alien-signals adapted suite must mount at least one fixture component');
	}
	const referencedIds = extractReferencedFixtureIds(adaptedSource);
	const fixtureIds = new Set(extractFixtureElementIds(fixtureSource));
	for (const id of referencedIds) {
		if (!fixtureIds.has(id)) {
			throw new Error(
				`alien-signals semantic fixture drift: adapted suite references #${id} missing from hooks.tsrx`,
			);
		}
	}
	const fixtureSha256 = fixtureFileFingerprint(fixtureSource);
	if (recordedFixtureSha256 && recordedFixtureSha256 !== fixtureSha256) {
		throw new Error(
			`alien-signals fixture drift in hooks.tsrx: expected sha256 ${recordedFixtureSha256} but found ${fixtureSha256}`,
		);
	}
	return {
		cases: pristineCases.length,
		fixtures: mounted.length,
		fixtureExports: exports.size,
		fixtureFileSha256: fixtureSha256,
		referencedFixtureIds: referencedIds.length,
		hookSurfaceCases: transitions.pristineHookSurfaceCases,
	};
}

export function assertRuntimeCrosswalk(
	pristineInventory,
	adaptedInventory,
	{ pristineSource, adaptedSource, fixtureSource, repoRoot, expectedFixtureSha256 } = {},
) {
	const pristineBare = titlesFromInventory(pristineInventory).map(stripSuitePrefix).sort();
	const adaptedBare = titlesFromInventory(adaptedInventory).map(stripSuitePrefix).sort();
	if (JSON.stringify(pristineBare) !== JSON.stringify(adaptedBare)) {
		throw new Error(
			`alien-signals runtime inventories are not one-for-one by title: ${describeTitleMismatch(pristineBare, adaptedBare)}`,
		);
	}
	let structure = null;
	if (pristineSource && adaptedSource && fixtureSource) {
		structure = assertRuntimeStructureCrosswalk({
			pristineSource,
			adaptedSource,
			fixtureSource,
			repoRoot,
			expectedFixtureSha256,
		});
	}
	return {
		titles: pristineBare.length,
		structure,
	};
}

export function assertAdaptedSourceExecutable(source, label = 'adapted suite') {
	if (DISABLED_REGISTRATION.test(source)) {
		throw new Error(
			`${label}: adapted upstream tests must execute without focused, failing/fails, skip, or todo markers`,
		);
	}
}

export function verifyAlienSignalsRuntimeStructure(root) {
	const pristineSource = readFileSync(
		resolve(root, 'packages/alien-signals/upstream/src/index.test.ts'),
		'utf8',
	);
	const adaptedSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/upstream-adapted.test.ts'),
		'utf8',
	);
	const fixtureSource = readFileSync(
		resolve(root, 'packages/alien-signals/tests/_fixtures/hooks.tsrx'),
		'utf8',
	);
	assertAdaptedSourceExecutable(
		adaptedSource,
		'packages/alien-signals/tests/upstream-adapted.test.ts',
	);
	return assertRuntimeStructureCrosswalk({
		pristineSource,
		adaptedSource,
		fixtureSource,
		repoRoot: root,
	});
}
