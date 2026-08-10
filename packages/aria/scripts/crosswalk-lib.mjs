import { readFileSync } from 'node:fs';
import ts from 'typescript';

export function exportedNames(file) {
	const source = ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
	const names = new Map();
	for (const statement of source.statements) {
		if (
			ts.isExportDeclaration(statement) &&
			statement.exportClause &&
			ts.isNamedExports(statement.exportClause)
		) {
			for (const element of statement.exportClause.elements) {
				names.set(
					element.name.text,
					statement.isTypeOnly || element.isTypeOnly ? 'type' : 'runtime',
				);
			}
		}
	}
	return names;
}

export function classifyExport(name, upstreamKind, octane, octanePath) {
	const octaneKind = octane.get(name);
	const compatibleKind =
		octaneKind === 'runtime' || (upstreamKind === 'type' && octaneKind === 'type');
	if (!compatibleKind) {
		return [
			name,
			upstreamKind,
			'gap',
			octaneKind
				? `${octanePath} exports ${name} only as ${octaneKind}, not ${upstreamKind}.`
				: `Not exported by ${octanePath} at this pin.`,
		];
	}
	return [
		name,
		upstreamKind,
		'surface-present-unverified',
		`${octanePath} exports ${name} with a compatible ${octaneKind} namespace; behavior remains bounded by the recorded-unverified manifest lanes.`,
	];
}
