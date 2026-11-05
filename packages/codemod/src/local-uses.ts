import ts from 'typescript';

export function scalar(type: ts.Type): boolean {
	if (type.isUnion()) return type.types.every(scalar);
	return !!(
		type.flags &
		(ts.TypeFlags.StringLike |
			ts.TypeFlags.NumberLike |
			ts.TypeFlags.BooleanLike |
			ts.TypeFlags.BigIntLike |
			ts.TypeFlags.Null |
			ts.TypeFlags.Undefined)
	);
}

export function localUses(file: ts.SourceFile, checker: ts.TypeChecker) {
	const refs = new Map<ts.Symbol, ts.Identifier[]>();
	const symbol = (id: ts.Identifier) =>
		ts.isShorthandPropertyAssignment(id.parent)
			? checker.getShorthandAssignmentValueSymbol(id.parent)
			: ts.isExportSpecifier(id.parent)
				? checker.getExportSpecifierLocalTargetSymbol(id.parent)
				: checker.getSymbolAtLocation(id);
	function visit(node: ts.Node) {
		if (ts.isIdentifier(node)) {
			const binding = symbol(node);
			if (binding) {
				const ids = refs.get(binding);
				if (ids) ids.push(node);
				else refs.set(binding, [node]);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return (id: ts.Identifier) => (refs.get(symbol(id)!) ?? []).filter((ref) => ref !== id);
}
