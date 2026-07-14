import { parseModule } from '@tsrx/core';

export interface ProfileMetadata {
	id: string;
	name: string;
	kind: string;
	file: string;
	line: number;
	column: number;
	componentId?: string;
	index?: number;
}

export interface ProfileCall {
	binding?: string;
	metadata: ProfileMetadata;
	start: number;
}

function objectValue(node: any): ProfileMetadata | undefined {
	if (node?.type !== 'ObjectExpression') return undefined;
	const value: Record<string, unknown> = {};
	for (const property of node.properties) {
		if (property.type !== 'Property' || property.value?.type !== 'Literal') continue;
		const key = property.key.name ?? property.key.value;
		value[key] = property.value.value;
	}
	return value as unknown as ProfileMetadata;
}

export function walkAst(node: any, visit: (node: any) => void): void {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walkAst(child, visit);
		return;
	}
	if (typeof node.type !== 'string') return;
	visit(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value) || (value && typeof value === 'object' && 'type' in value)) {
			walkAst(value, visit);
		}
	}
}

export function inspectProfileOutput(code: string) {
	const ast = parseModule(code, 'compiled.js');
	const importedLocals = new Map<string, string>();
	const mainImports = new Set<string>();

	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		const source = statement.source.value;
		for (const specifier of statement.specifiers) {
			if (specifier.type !== 'ImportSpecifier') continue;
			const imported = specifier.imported.name;
			if (source === 'octane/profiling') importedLocals.set(specifier.local.name, imported);
			if (source === 'octane') mainImports.add(imported);
		}
	}

	const components: ProfileCall[] = [];
	const hooks: ProfileCall[] = [];
	walkAst(ast, (node) => {
		if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') return;
		const imported = importedLocals.get(node.callee.name);
		if (imported !== '__profileComponent' && imported !== '__profileHook') return;
		const metadata = objectValue(node.arguments[1]);
		if (!metadata) return;
		const call = {
			binding: node.arguments[0]?.type === 'Identifier' ? node.arguments[0].name : undefined,
			metadata,
			start: node.start,
		};
		(imported === '__profileComponent' ? components : hooks).push(call);
	});

	return {
		ast,
		components,
		hooks,
		profileImports: new Set(importedLocals.values()),
		mainImports,
	};
}

export function uniqueMetadata(calls: ProfileCall[]): ProfileMetadata[] {
	return [...new Map(calls.map(({ metadata }) => [metadata.id, metadata])).values()];
}
