import { parseModule } from '@tsrx/core';
import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// A React-style `.tsx` `return <jsx>` body is VALUE position: the client lowers it
// to element descriptors, so a component's children are a DESCRIPTOR
// (one hydration block). A `@{}` body is TEMPLATE position: the client uses a
// `__children` render-fn (an extra block). The SERVER must match per form, or the
// server tree is one block deeper than the client and the hydration cursor desyncs
// (the bug that broke the JSX Hacker News example's SSR: a `setSpread … is not a
// function` from a descendant boundary). These assert the compiled children shape.

function clientCode(src: string): string {
	return compile(src, 'f.tsx', {}).code;
}
function serverCode(src: string): string {
	return compile(src, 'f.tsx', { mode: 'server' }).code;
}

function runtimeImports(code: string, names: readonly string[]): Set<string> {
	const factories = new Set<string>();
	const program = parseModule(code, 'compiled.js');
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		if (statement.source?.value !== 'octane' && statement.source?.value !== 'octane/server') {
			continue;
		}
		for (const specifier of statement.specifiers) {
			if (specifier.type !== 'ImportSpecifier') continue;
			if (names.includes(specifier.imported?.name)) {
				factories.add(specifier.local.name);
			}
		}
	}
	return factories;
}

function descriptorFactories(code: string): Set<string> {
	return runtimeImports(code, ['createElement', 'createScopedElement']);
}

function elementDescriptorCalls(code: string, component: string, root?: any): any[] {
	const factories = descriptorFactories(code);
	const calls: any[] = [];
	const seen = new WeakSet<object>();
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'CallExpression' &&
			factories.has(node.callee?.name) &&
			node.arguments[0]?.name === component
		) {
			calls.push(node);
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			if (Array.isArray(value)) value.forEach(visit);
			else visit(value);
		}
	};
	visit(root ?? parseModule(code, 'compiled.js'));
	return calls;
}

function childrenValues(code: string): any[] {
	const values: any[] = [];
	const seen = new WeakSet<object>();
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'Property' &&
			!node.computed &&
			(node.key?.name === 'children' || node.key?.value === 'children')
		) {
			values.push(node.value);
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			if (Array.isArray(value)) value.forEach(visit);
			else visit(value);
		}
	};
	visit(parseModule(code, 'compiled.js'));
	return values;
}

describe('.tsx return-form component children — server matches client (descriptors)', () => {
	const RETURN_FORM = `
		export function App({ client, router }) {
			return (
				<Provider client={client}>
					<Inner router={router} />
				</Provider>
			);
		}`;

	it('client lowers return-form components and children to element descriptors', () => {
		const code = clientCode(RETURN_FORM);
		expect(elementDescriptorCalls(code, 'Provider').length).toBeGreaterThan(0);
		expect(elementDescriptorCalls(code, 'Inner').length).toBeGreaterThan(0);
	});

	it('server passes return-form children as an element descriptor, not a render block', () => {
		const code = serverCode(RETURN_FORM);
		const childrenBlockFactories = runtimeImports(code, ['markChildrenBlock']);
		// The child remains an inspectable descriptor rather than a template-only
		// children block, even when its complete record is deferred until inspection.
		const values = childrenValues(code);
		expect(
			values.some(
				(value) =>
					!(value.type === 'CallExpression' && childrenBlockFactories.has(value.callee?.name)) &&
					elementDescriptorCalls(code, 'Inner', value).length > 0,
			),
		).toBe(true);
	});

	it('`@{}` (template-form) children stay a __schildren render-fn on the server', () => {
		// The same shape authored as a `@{}` body is template position — the client
		// uses componentSlot + a render-fn there, so the server keeps the render-fn too.
		const TEMPLATE_FORM = `
			export function App({ client, router }) @{
				<Provider client={client}>
					<Inner router={router} />
				</Provider>
			}`;
		const code = serverCode(TEMPLATE_FORM);
		const childrenBlockFactories = runtimeImports(code, ['markChildrenBlock']);
		// Tagged as a children block so render-prop checks agree on both runtimes.
		expect(
			childrenValues(code).some(
				(value) =>
					value.type === 'CallExpression' &&
					childrenBlockFactories.has(value.callee?.name) &&
					value.arguments[0]?.type === 'Identifier',
			),
		).toBe(true);
	});
});
