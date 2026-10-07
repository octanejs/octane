// TypeScript 7 (`typescript-native`) vocabulary for the react-port type evidence.
// Its API reports symbols, types and signatures as remote objects: references
// between them are numeric ids reached through getters (`getSymbol()`,
// `getTypes()`, `getParameters()`), and declarations are handles to resolve.
// These helpers keep that in one place, so evidence code never reads an id
// field where it meant an object and silently gets `undefined`.
import path from 'node:path';
import { importNativeTypeScript, NATIVE_LIBRARY_DIRECTORY } from '../octane-tsc/native.mjs';

export const { IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags, TypeFormatFlags } =
	await importNativeTypeScript('unstable/sync');
export const { SyntaxKind } = await importNativeTypeScript('unstable/ast');
export const is = await importNativeTypeScript('unstable/ast/is');

/** The resolved declaration nodes of a symbol (TypeScript 7 gives handles). */
export function declarationsOf(symbol) {
	return (symbol?.declarations ?? []).map((handle) => handle.resolve()).filter(Boolean);
}

export function valueDeclarationOf(symbol) {
	return symbol?.valueDeclaration?.resolve();
}

/** `valueDeclaration ?? declarations[0]`, the declaration a symbol's type is read at. */
export function primaryDeclarationOf(symbol) {
	return valueDeclarationOf(symbol) ?? declarationsOf(symbol)[0];
}

/** A union's members, or `undefined` for any other type. */
export function unionMembers(type) {
	return type?.isUnionType?.() ? type.getTypes() : undefined;
}

/** The type arguments an alias was written with, or `undefined` without any. */
export function aliasTypeArgumentsOf(type) {
	const arguments_ = type?.getAliasTypeArguments?.();
	return arguments_?.length ? arguments_ : undefined;
}

/** Alias type arguments, else a type reference's own arguments. */
export function typeArgumentsOf(type, checker) {
	return (
		aliasTypeArgumentsOf(type) ??
		(type.objectFlags & ObjectFlags.Reference ? checker.getTypeArguments(type) : [])
	);
}

/**
 * A reference's generic target, or `undefined`. `getTarget()` throws for a type
 * without one, where the classic `type.target` was simply absent.
 */
export function targetOf(type) {
	return type?.target ? type.getTarget() : undefined;
}

/** The symbol a type is named by: its alias, else its own symbol. */
export function namingSymbolOf(type) {
	return type?.getAliasSymbol?.() ?? type?.getSymbol?.();
}

/** Whether a file is one of the native compiler's own `lib.*.d.ts` declarations. */
export function isTypeScriptLibraryFile(fileName) {
	const relative = path.relative(NATIVE_LIBRARY_DIRECTORY, fileName);
	return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function isTypeScriptLibraryNode(node) {
	return isTypeScriptLibraryFile(node.getSourceFile().fileName);
}

export function hasModifier(node, kind) {
	return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}
