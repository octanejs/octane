/** Optional TypeScript-only validation. Never imported by the ordinary compiler. */
import { NATIVE_SIGNAL_NAME, NATIVE_MEMO_READ, nativeReadDiagnostic } from './native-read-facts.js';

const NATIVE_MODULES = new Set([
	'octane/signals',
	'octane/signals/client',
	'octane/signals/server',
]);

/**
 * The TypeScript vocabulary the validation reads, so one implementation runs on
 * the classic compiler API and on TypeScript 7's native API. Both keep the
 * identity of nodes, types, symbols, and signatures within one Program (a
 * TypeScript 7 snapshot), which the caches and sets below rely on.
 * @typedef {object} NativeReadHost
 * @property {any} is Node predicates, named as in the classic API.
 * @property {any} SymbolFlags
 * @property {any} TypeFlags
 * @property {any} ObjectFlags
 * @property {any} SignatureKind
 * @property {any} SyntaxKind
 * @property {(node: any, visit: (node: any) => void) => void} forEachChild
 * @property {(program: any) => any} checkerOf
 * @property {(symbol: any) => readonly any[]} declarationsOf Declaration nodes.
 * @property {(symbol: any) => any} valueDeclarationOf
 * @property {(signature: any) => any} signatureDeclarationOf
 * @property {(type: any) => readonly any[] | undefined} partsOf Union or intersection members.
 * @property {(program: any) => Iterable<any>} moduleFilesOf Files whose imports name modules.
 * @property {(program: any, checker: any) => Iterable<[symbol: any, request: string]>} ambientModulesOf
 */

/**
 * @param {typeof import('typescript')} ts
 * @returns {NativeReadHost}
 */
export function classicNativeReadHost(ts) {
	return {
		is: ts,
		SymbolFlags: ts.SymbolFlags,
		TypeFlags: ts.TypeFlags,
		ObjectFlags: ts.ObjectFlags,
		SignatureKind: ts.SignatureKind,
		SyntaxKind: ts.SyntaxKind,
		forEachChild: ts.forEachChild,
		checkerOf: (program) => program.getTypeChecker(),
		declarationsOf: (symbol) => symbol.declarations ?? [],
		valueDeclarationOf: (symbol) => symbol.valueDeclaration,
		signatureDeclarationOf: (signature) => signature?.declaration,
		partsOf: (type) => (type.isUnionOrIntersection() ? type.types : undefined),
		moduleFilesOf: (program) => program.getSourceFiles(),
		ambientModulesOf: (_program, checker) =>
			checker.getAmbientModules().map((symbol) => [symbol, symbol.name.slice(1, -1)]),
	};
}

/**
 * TypeScript 7 reaches symbols' declarations through handles, has no ambient
 * module list, and names three predicates differently. Its default library
 * files declare no Octane module, so they are not fetched from its process.
 * @param {any} sync typescript/unstable/sync
 * @param {any} ast typescript/unstable/ast
 * @param {any} is typescript/unstable/ast/is
 * @returns {NativeReadHost}
 */
export function nativeNativeReadHost(sync, ast, is) {
	const moduleFilesOf = (program) =>
		program
			.getSourceFileNames()
			.filter((name) => !program.getSourceFileMetadata(name)?.isDefaultLibrary)
			.map((name) => program.getSourceFile(name));
	return {
		is: {
			...is,
			isFunctionLike: is.isSignatureDeclaration,
			isStringLiteralLike: is.isStringLiteralLikeNode,
			isTypeAssertionExpression: is.isTypeAssertion,
		},
		SymbolFlags: sync.SymbolFlags,
		TypeFlags: sync.TypeFlags,
		ObjectFlags: sync.ObjectFlags,
		SignatureKind: sync.SignatureKind,
		SyntaxKind: ast.SyntaxKind,
		forEachChild: (node, visit) => node.forEachChild(visit),
		checkerOf: (program) => program.getProject().checker,
		declarationsOf: (symbol) =>
			(symbol.declarations ?? []).map((handle) => handle.resolve()).filter(Boolean),
		valueDeclarationOf: (symbol) => symbol.valueDeclaration?.resolve(),
		signatureDeclarationOf: (signature) => signature?.declaration?.resolve(),
		partsOf: (type) =>
			type.isUnionType() || type.isIntersectionType() ? type.getTypes() : undefined,
		moduleFilesOf,
		*ambientModulesOf(program, checker) {
			for (const file of moduleFilesOf(program)) {
				for (const statement of file.statements) {
					if (is.isModuleDeclaration(statement) && is.isStringLiteral(statement.name)) {
						yield [checker.getSymbolAtLocation(statement.name), statement.name.text];
					}
				}
			}
		},
	};
}

/**
 * Validate native capabilities in an existing TypeScript Program. The caller
 * owns project lifetime and source-map translation for virtual .tsrx files.
 * Diagnostics refer to the exact SourceFile text in this Program; this entry
 * neither reads a second source snapshot nor creates a hidden type project.
 *
 * The SIGNAL_HANDLE marker is resolved as a nominal TypeScript symbol from
 * octane/signals. No runtime symbol property, name heuristic, or object shape
 * makes an unrelated value a native signal.
 * @param {NativeReadHost} host
 * @param {any} program
 * @param {string | any} file
 * @returns {import('./index.js').CompileDiagnostic[]}
 */
export function validateNativeSignalNamesWith(host, program, file) {
	const { is, SymbolFlags, TypeFlags, ObjectFlags, SignatureKind, SyntaxKind, forEachChild } = host;
	const sourceFile = typeof file === 'string' ? program.getSourceFile(file) : file;
	if (sourceFile === undefined || program.getSourceFile(sourceFile.fileName) !== sourceFile) {
		throw new TypeError(
			'Native signal type validation requires a SourceFile from the current Program.',
		);
	}
	const checker = host.checkerOf(program);
	const brands = new Set();
	const nativeReadSignatures = new Set();
	const memoSignatures = new Set();
	const inspectedModules = new Set();
	function canonical(symbol) {
		const seen = new Set();
		while (symbol && (symbol.flags & SymbolFlags.Alias) !== 0 && !seen.has(symbol)) {
			seen.add(symbol);
			symbol = checker.getAliasedSymbol(symbol);
		}
		return symbol;
	}
	function symbolType(symbol) {
		const declaration = host.valueDeclarationOf(symbol) ?? host.declarationsOf(symbol)[0];
		return declaration ? checker.getTypeOfSymbolAtLocation(symbol, declaration) : null;
	}
	function recordSignatures(type, into) {
		if (type === null) return;
		for (const signature of checker.getSignaturesOfType(type, SignatureKind.Call)) {
			const declaration = host.signatureDeclarationOf(signature);
			if (declaration) into.add(declaration);
		}
	}
	function recordReads(type, names) {
		if (type === null) return;
		for (const name of names) {
			const property = checker.getPropertyOfType(type, name);
			if (property) recordSignatures(symbolType(property), nativeReadSignatures);
		}
	}
	function recordFactory(exports, name) {
		const factory = exports.get(name);
		const type = factory && symbolType(factory);
		if (!type) return;
		for (const signature of checker.getSignaturesOfType(type, SignatureKind.Call)) {
			const returned = checker.getReturnTypeOfSignature(signature);
			recordReads(returned, ['get', 'latest', 'snapshot']);
			for (const property of checker.getPropertiesOfType(returned)) {
				for (const declaration of host.declarationsOf(property)) {
					if (!declaration.name || !is.isComputedPropertyName(declaration.name)) continue;
					const marker = canonical(checker.getSymbolAtLocation(declaration.name.expression));
					if (marker?.name === 'SIGNAL_HANDLE') brands.add(marker);
				}
			}
		}
	}
	function inspectModule(symbol, request) {
		symbol = canonical(symbol);
		if (!symbol || inspectedModules.has(symbol)) return;
		inspectedModules.add(symbol);
		const exports = new Map(
			checker.getExportsOfModule(symbol).map((entry) => [entry.name, canonical(entry)]),
		);
		if (request === 'octane/signals') {
			const marker = exports.get('SIGNAL_HANDLE');
			if (marker) brands.add(marker);
			for (const name of ['SignalHandle', 'Resource', 'WritableSignal', 'DerivedSignal']) {
				const exported = exports.get(name);
				if (exported)
					recordReads(checker.getDeclaredTypeOfSymbol(exported), ['get', 'latest', 'snapshot']);
			}
			const factory = exports.get('createScope');
			const type = factory && symbolType(factory);
			if (type)
				for (const signature of checker.getSignaturesOfType(type, SignatureKind.Call))
					recordReads(checker.getReturnTypeOfSignature(signature), ['get']);
			for (const name of ['signal$', 'derived$', 'query$']) recordFactory(exports, name);
		} else if (NATIVE_MODULES.has(request)) {
			// A project may import only the optional local hook entry. Follow the
			// trusted export's actual return type to the same nominal declaration;
			// do not require a redundant bare-engine import or brand lookalikes.
			for (const name of ['useSignal$', 'signal$', 'derived$', 'query$']) {
				recordFactory(exports, name);
			}
		} else if (request === 'octane') {
			const memo = exports.get('useMemo');
			if (memo) recordSignatures(symbolType(memo), memoSignatures);
		}
	}
	for (const moduleFile of host.moduleFilesOf(program)) {
		for (const statement of moduleFile.statements) {
			if (
				(is.isImportDeclaration(statement) || is.isExportDeclaration(statement)) &&
				statement.moduleSpecifier &&
				is.isStringLiteral(statement.moduleSpecifier)
			) {
				const request = statement.moduleSpecifier.text;
				if (NATIVE_MODULES.has(request) || request === 'octane')
					inspectModule(checker.getSymbolAtLocation(statement.moduleSpecifier), request);
			}
		}
	}
	for (const [symbol, request] of host.ambientModulesOf(program, checker)) {
		if (NATIVE_MODULES.has(request) || request === 'octane') inspectModule(symbol, request);
	}
	if (brands.size === 0) return [];
	const handleCache = new Map();
	function isHandle(type, active = new Set()) {
		if (handleCache.has(type)) return handleCache.get(type);
		if (!type || active.has(type) || (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0)
			return false;
		active.add(type);
		let result = false;
		const parts = host.partsOf(type);
		if (parts) result = parts.some((part) => isHandle(part, active));
		if (!result && (type.flags & TypeFlags.TypeParameter) !== 0) {
			const constraint = checker.getBaseConstraintOfType(type);
			if (constraint && constraint !== type) result = isHandle(constraint, active);
		}
		if (!result)
			for (const property of checker.getPropertiesOfType(type)) {
				for (const declaration of host.declarationsOf(property)) {
					if (
						declaration.name &&
						is.isComputedPropertyName(declaration.name) &&
						brands.has(canonical(checker.getSymbolAtLocation(declaration.name.expression)))
					) {
						const getter = checker.getPropertyOfType(type, 'get');
						result =
							getter !== undefined &&
							checker.getSignaturesOfType(symbolType(getter), SignatureKind.Call).length > 0;
						break;
					}
				}
				if (result) break;
			}
		active.delete(type);
		handleCache.set(type, result);
		return result;
	}
	function containsHandle(type, active = new Set()) {
		if (isHandle(type)) return true;
		if (!type || active.has(type) || (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0)
			return false;
		active.add(type);
		const parts = host.partsOf(type);
		if (parts) return parts.some((part) => containsHandle(part, active));
		if ((type.flags & TypeFlags.Object) === 0) return false;
		// A Scope contains callable factory methods; holding that ordinary owner
		// object does not itself expose a handle. Returned aggregate fields do.
		if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) return false;
		if (
			(type.objectFlags & ObjectFlags.Reference) !== 0 &&
			checker.getTypeArguments(type).some((argument) => containsHandle(argument, active))
		)
			return true;
		for (const property of checker.getPropertiesOfType(type)) {
			if (containsHandle(symbolType(property), active)) return true;
		}
		return false;
	}
	function exposesHandle(type) {
		if (isHandle(type)) return true;
		return checker
			.getSignaturesOfType(type, SignatureKind.Call)
			.some((signature) => containsHandle(checker.getReturnTypeOfSignature(signature)));
	}
	const functionReadCache = new Map();
	function readsLive(fn, active = new Set()) {
		if (nativeReadSignatures.has(fn)) return true;
		if (!fn?.body) return false;
		if (functionReadCache.has(fn)) return functionReadCache.get(fn);
		if (active.has(fn)) return false;
		active.add(fn);
		let reads = false;
		function visit(node) {
			if (reads || (node !== fn.body && is.isFunctionLike(node))) return;
			if (is.isCallExpression(node)) {
				const declaration = host.signatureDeclarationOf(checker.getResolvedSignature(node));
				if (
					declaration &&
					(nativeReadSignatures.has(declaration) || readsLive(declaration, active))
				) {
					reads = true;
					return;
				}
			}
			forEachChild(node, visit);
		}
		visit(fn.body);
		active.delete(fn);
		functionReadCache.set(fn, reads);
		return reads;
	}
	function functionsOf(node) {
		if (is.isArrowFunction(node) || is.isFunctionExpression(node)) return [node];
		const type = checker.getTypeAtLocation(node);
		return checker
			.getSignaturesOfType(type, SignatureKind.Call)
			.map((signature) => host.signatureDeclarationOf(signature))
			.filter(Boolean);
	}
	const jsxFunctions = new Map();
	function returnsJsx(fn) {
		if (jsxFunctions.has(fn)) return jsxFunctions.get(fn);
		let found = false;
		function visit(node) {
			if (found || (node !== fn.body && is.isFunctionLike(node))) return;
			if (is.isJsxElement(node) || is.isJsxSelfClosingElement(node) || is.isJsxFragment(node)) {
				found = true;
				return;
			}
			forEachChild(node, visit);
		}
		if (fn.body) visit(fn.body);
		jsxFunctions.set(fn, found);
		return found;
	}
	function exposesLiveRead(node) {
		for (const fn of functionsOf(node)) {
			if (returnsJsx(fn)) continue;
			const signature = checker.getSignatureFromDeclaration(fn);
			if (!signature) continue;
			const type = checker.getReturnTypeOfSignature(signature);
			if (
				(type.flags & (TypeFlags.Void | TypeFlags.Undefined | TypeFlags.Never)) === 0 &&
				readsLive(fn)
			)
				return true;
		}
		return false;
	}
	const diagnostics = [];
	const reported = new Set();
	function report(code, node, message) {
		const start = node.getStart(sourceFile);
		const key = `${code}:${start}:${node.end}`;
		if (reported.has(key)) return;
		reported.add(key);
		diagnostics.push(
			nativeReadDiagnostic(code, sourceFile.text, sourceFile.fileName, start, node.end, message),
		);
	}
	function checkName(name, value = name) {
		if (!name || (!is.isIdentifier(name) && !is.isStringLiteralLike(name))) return;
		const text = name.text;
		if (text.endsWith('$') || !/^[$A-Z_a-z][$\w]*$/.test(text)) return;
		if (exposesHandle(checker.getTypeAtLocation(value)) || exposesLiveRead(value))
			report(
				NATIVE_SIGNAL_NAME,
				name,
				`Native signal handles and functions exposing handles or live reads must end in $. Rename ${JSON.stringify(text)} to ${JSON.stringify(text + '$')}; sampled values keep ordinary names.`,
			);
	}
	function unwrapExpression(node) {
		while (
			node &&
			(is.isParenthesizedExpression(node) ||
				is.isAsExpression(node) ||
				is.isTypeAssertionExpression(node) ||
				is.isNonNullExpression(node) ||
				is.isSatisfiesExpression(node))
		) {
			node = node.expression;
		}
		return node;
	}
	function createsCapability(node) {
		node = unwrapExpression(node);
		if (!node) return false;
		if (is.isCallExpression(node)) return exposesHandle(checker.getTypeAtLocation(node));
		return (
			(is.isArrowFunction(node) || is.isFunctionExpression(node)) &&
			(exposesHandle(checker.getTypeAtLocation(node)) || exposesLiveRead(node))
		);
	}
	function isDomStyleProperty(node) {
		let object = node.parent;
		if (!is.isObjectLiteralExpression(object)) return false;
		while (
			object.parent &&
			(is.isParenthesizedExpression(object.parent) ||
				is.isAsExpression(object.parent) ||
				is.isSatisfiesExpression(object.parent) ||
				is.isNonNullExpression(object.parent) ||
				(is.isBinaryExpression(object.parent) &&
					(object.parent.operatorToken.kind === SyntaxKind.BarBarToken ||
						object.parent.operatorToken.kind === SyntaxKind.QuestionQuestionToken ||
						(object.parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken &&
							object.parent.right === object))) ||
				(is.isConditionalExpression(object.parent) &&
					(object.parent.whenTrue === object || object.parent.whenFalse === object)))
		)
			object = object.parent;
		const container = object.parent;
		if (!container || !is.isJsxExpression(container)) return false;
		const attribute = container.parent;
		if (!is.isJsxAttribute(attribute) || attribute.name.getText(sourceFile) !== 'style')
			return false;
		const tag = attribute.parent.parent.tagName;
		return is.isIdentifier(tag) && /^[a-z]/.test(tag.text);
	}
	function visit(node) {
		if (is.isVariableDeclaration(node)) {
			if (node.initializer && createsCapability(node.initializer))
				checkName(node.name, node.initializer);
		} else if (is.isPropertyAssignment(node)) {
			if (!isDomStyleProperty(node) && createsCapability(node.initializer))
				checkName(node.name, node.initializer);
		} else if (is.isPropertyDeclaration(node)) {
			if (node.initializer && createsCapability(node.initializer))
				checkName(node.name, node.initializer);
		} else if (
			is.isFunctionDeclaration(node) ||
			is.isMethodDeclaration(node) ||
			is.isGetAccessorDeclaration(node)
		) {
			checkName(node.name);
		} else if (is.isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.EqualsToken) {
			if (createsCapability(node.right)) {
				if (is.isPropertyAccessExpression(node.left)) checkName(node.left.name, node.right);
				else if (is.isElementAccessExpression(node.left))
					checkName(node.left.argumentExpression, node.right);
			}
		} else if (is.isCallExpression(node)) {
			const declaration = host.signatureDeclarationOf(checker.getResolvedSignature(node));
			if (
				declaration &&
				memoSignatures.has(declaration) &&
				node.arguments[0] &&
				node.arguments.length > 1 &&
				node.arguments[1]?.kind !== SyntaxKind.NullKeyword &&
				functionsOf(node.arguments[0]).some((fn) => readsLive(fn))
			) {
				report(
					NATIVE_MEMO_READ,
					node,
					'A live native signal read inside useMemo is not represented by an explicit dependency array. Omit the array to track native reads, or sample the signal during render and pass that value in the array. Explicit arrays are never rewritten; null runs the callback on every render.',
				);
			}
		}
		forEachChild(node, visit);
	}
	visit(sourceFile);
	diagnostics.sort((left, right) => left.start.offset - right.start.offset);
	return diagnostics;
}
