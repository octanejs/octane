/** Optional TypeScript-only validation. Never imported by the ordinary compiler. */
import ts from 'typescript';
import { NATIVE_SIGNAL_NAME, NATIVE_MEMO_READ, nativeReadDiagnostic } from './native-read-facts.js';

const NATIVE_MODULES = new Set([
	'octane/signals',
	'octane/signals/client',
	'octane/signals/server',
]);

/**
 * Validate native capabilities in an existing TypeScript Program. The caller
 * owns project lifetime and source-map translation for virtual .tsrx files.
 * Diagnostics refer to the exact SourceFile text in this Program; this entry
 * neither reads a second source snapshot nor creates a hidden type project.
 *
 * The SIGNAL_HANDLE marker is resolved as a nominal TypeScript symbol from
 * octane/signals. No runtime symbol property, name heuristic, or object shape
 * makes an unrelated value a native signal.
 * @param {import('typescript').Program} program
 * @param {string | import('typescript').SourceFile} file
 * @returns {import('./index.js').CompileDiagnostic[]}
 */
export function validateNativeSignalNames(program, file) {
	const sourceFile = typeof file === 'string' ? program.getSourceFile(file) : file;
	if (sourceFile === undefined || program.getSourceFile(sourceFile.fileName) !== sourceFile) {
		throw new TypeError(
			'Native signal type validation requires a SourceFile from the current Program.',
		);
	}
	const checker = program.getTypeChecker();
	const brands = new Set();
	const nativeReadSignatures = new Set();
	const memoSignatures = new Set();
	const inspectedModules = new Set();
	function canonical(symbol) {
		const seen = new Set();
		while (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(symbol)) {
			seen.add(symbol);
			symbol = checker.getAliasedSymbol(symbol);
		}
		return symbol;
	}
	function symbolType(symbol) {
		const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
		return declaration ? checker.getTypeOfSymbolAtLocation(symbol, declaration) : null;
	}
	function recordSignatures(type, into) {
		if (type === null) return;
		for (const signature of checker.getSignaturesOfType(type, ts.SignatureKind.Call))
			if (signature.declaration) into.add(signature.declaration);
	}
	function recordReads(type, names) {
		if (type === null) return;
		for (const name of names) {
			const property = checker.getPropertyOfType(type, name);
			if (property) recordSignatures(symbolType(property), nativeReadSignatures);
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
				for (const signature of checker.getSignaturesOfType(type, ts.SignatureKind.Call))
					recordReads(checker.getReturnTypeOfSignature(signature), ['get']);
		} else if (NATIVE_MODULES.has(request)) {
			// A project may import only the optional local hook entry. Follow the
			// trusted export's actual return type to the same nominal declaration;
			// do not require a redundant bare-engine import or brand lookalikes.
			const hook = exports.get('useSignal$');
			const type = hook && symbolType(hook);
			if (type)
				for (const signature of checker.getSignaturesOfType(type, ts.SignatureKind.Call)) {
					const returned = checker.getReturnTypeOfSignature(signature);
					recordReads(returned, ['get', 'latest', 'snapshot']);
					for (const property of checker.getPropertiesOfType(returned)) {
						for (const declaration of property.declarations ?? []) {
							if (!declaration.name || !ts.isComputedPropertyName(declaration.name)) continue;
							const marker = canonical(checker.getSymbolAtLocation(declaration.name.expression));
							if (marker?.name === 'SIGNAL_HANDLE') brands.add(marker);
						}
					}
				}
		} else if (request === 'octane') {
			const memo = exports.get('useMemo');
			if (memo) recordSignatures(symbolType(memo), memoSignatures);
		}
	}
	for (const moduleFile of program.getSourceFiles()) {
		for (const statement of moduleFile.statements) {
			if (
				(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
			) {
				const request = statement.moduleSpecifier.text;
				if (NATIVE_MODULES.has(request) || request === 'octane')
					inspectModule(checker.getSymbolAtLocation(statement.moduleSpecifier), request);
			}
		}
	}
	for (const symbol of checker.getAmbientModules()) {
		const request = symbol.name.slice(1, -1);
		if (NATIVE_MODULES.has(request) || request === 'octane') inspectModule(symbol, request);
	}
	if (brands.size === 0) return [];
	const handleCache = new Map();
	function isHandle(type, active = new Set()) {
		if (handleCache.has(type)) return handleCache.get(type);
		if (!type || active.has(type) || (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0)
			return false;
		active.add(type);
		let result = false;
		if (type.isUnionOrIntersection()) result = type.types.some((part) => isHandle(part, active));
		if (!result && (type.flags & ts.TypeFlags.TypeParameter) !== 0) {
			const constraint = checker.getBaseConstraintOfType(type);
			if (constraint && constraint !== type) result = isHandle(constraint, active);
		}
		if (!result)
			for (const property of checker.getPropertiesOfType(type)) {
				for (const declaration of property.declarations ?? []) {
					if (
						declaration.name &&
						ts.isComputedPropertyName(declaration.name) &&
						brands.has(canonical(checker.getSymbolAtLocation(declaration.name.expression)))
					) {
						const getter = checker.getPropertyOfType(type, 'get');
						result =
							getter !== undefined &&
							checker.getSignaturesOfType(symbolType(getter), ts.SignatureKind.Call).length > 0;
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
		if (!type || active.has(type) || (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0)
			return false;
		active.add(type);
		if (type.isUnionOrIntersection())
			return type.types.some((part) => containsHandle(part, active));
		if ((type.flags & ts.TypeFlags.Object) === 0) return false;
		// A Scope contains callable factory methods; holding that ordinary owner
		// object does not itself expose a handle. Returned aggregate fields do.
		if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return false;
		if (
			(type.objectFlags & ts.ObjectFlags.Reference) !== 0 &&
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
			.getSignaturesOfType(type, ts.SignatureKind.Call)
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
			if (reads || (node !== fn.body && ts.isFunctionLike(node))) return;
			if (ts.isCallExpression(node)) {
				const declaration = checker.getResolvedSignature(node)?.declaration;
				if (
					declaration &&
					(nativeReadSignatures.has(declaration) || readsLive(declaration, active))
				) {
					reads = true;
					return;
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(fn.body);
		active.delete(fn);
		functionReadCache.set(fn, reads);
		return reads;
	}
	function functionsOf(node) {
		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return [node];
		const type = checker.getTypeAtLocation(node);
		return checker
			.getSignaturesOfType(type, ts.SignatureKind.Call)
			.map((signature) => signature.declaration)
			.filter(Boolean);
	}
	const jsxFunctions = new Map();
	function returnsJsx(fn) {
		if (jsxFunctions.has(fn)) return jsxFunctions.get(fn);
		let found = false;
		function visit(node) {
			if (found || (node !== fn.body && ts.isFunctionLike(node))) return;
			if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
				found = true;
				return;
			}
			ts.forEachChild(node, visit);
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
				(type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)) === 0 &&
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
		if (!name || (!ts.isIdentifier(name) && !ts.isStringLiteralLike(name))) return;
		const text = name.text;
		if (text.endsWith('$') || !/^[$A-Z_a-z][$\w]*$/.test(text)) return;
		if (exposesHandle(checker.getTypeAtLocation(value)) || exposesLiveRead(value))
			report(
				NATIVE_SIGNAL_NAME,
				name,
				`Native signal handles and functions exposing handles or live reads must end in $. Rename ${JSON.stringify(text)} to ${JSON.stringify(text + '$')}; sampled values keep ordinary names.`,
			);
	}
	function valueExport(node) {
		if (node.isTypeOnly || node.parent.parent.isTypeOnly) return false;
		const symbol = canonical(checker.getSymbolAtLocation(node.name));
		return symbol && (symbol.flags & ts.SymbolFlags.Value) !== 0;
	}
	function visit(node) {
		if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
			checkName(node.name);
		} else if (ts.isImportSpecifier(node)) {
			if (!node.isTypeOnly && !node.parent.parent.isTypeOnly) checkName(node.name);
		} else if (ts.isExportSpecifier(node)) {
			if (valueExport(node)) checkName(node.name, node.propertyName ?? node.name);
		} else if (ts.isPropertyAssignment(node)) {
			checkName(node.name, node.initializer);
		} else if (
			ts.isShorthandPropertyAssignment(node) ||
			ts.isPropertyDeclaration(node) ||
			ts.isPropertySignature(node)
		) {
			checkName(node.name);
		} else if (
			ts.isFunctionDeclaration(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isGetAccessorDeclaration(node)
		) {
			checkName(node.name);
		} else if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			if (ts.isPropertyAccessExpression(node.left)) checkName(node.left.name, node.right);
			else if (ts.isElementAccessExpression(node.left))
				checkName(node.left.argumentExpression, node.right);
		} else if (ts.isCallExpression(node)) {
			const declaration = checker.getResolvedSignature(node)?.declaration;
			if (
				declaration &&
				memoSignatures.has(declaration) &&
				node.arguments[0] &&
				node.arguments.length > 1 &&
				node.arguments[1]?.kind !== ts.SyntaxKind.NullKeyword &&
				functionsOf(node.arguments[0]).some((fn) => readsLive(fn))
			) {
				report(
					NATIVE_MEMO_READ,
					node,
					'A live native signal read inside useMemo is not represented by an explicit dependency array. Omit the array to track native reads, or sample the signal during render and pass that value in the array. Explicit arrays are never rewritten; null runs the callback on every render.',
				);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	diagnostics.sort((left, right) => left.start.offset - right.start.offset);
	return diagnostics;
}
