import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { decodeMappings } from '../_source-map.js';
import { compile } from '../../src/compiler/compile.js';

const { parseModule } = createRequire(import.meta.url)('@tsrx/core');

function rootCalleeOffset(code: string): number | undefined {
	let offset: number | undefined;
	const seen = new WeakSet();
	const visit = (value: unknown) => {
		if (value === null || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		const node = value as {
			type?: string;
			id?: { name?: string };
			init?: { type?: string; callee?: { type?: string; start?: number } };
		};
		if (
			node.type === 'VariableDeclarator' &&
			node.id?.name === 'root' &&
			node.init?.type === 'CallExpression' &&
			node.init.callee?.type === 'Identifier'
		)
			offset = node.init.callee.start;
		for (const child of Object.values(value)) visit(child);
	};
	visit(parseModule(code, 'compiled.js'));
	return offset;
}

describe('same-file root compiler artifact origins', () => {
	it.each(['createRoot', 'hydrateRoot'])(
		'preserves COW and the authored %s callee source coordinate',
		(factory) => {
			const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
			try {
				process.env.OCTANE_COMPILE_FROZEN_AST = '1';
				const prefix = `import {${factory}} from 'octane';\nfunction View() @{ <main>first</main> }\n`;
				const body =
					factory === 'createRoot'
						? 'export function mount(el) { const root=createRoot(el); root.render(View); root.unmount(); }'
						: 'export function mount(el) { const root=hydrateRoot(el,View,undefined,{identifierPrefix:"one-"}); root.unmount(); }';
				const source = prefix + body;
				const result = compile(source, 'same-file-root.tsrx', { hmr: false, dev: false });
				const offset = rootCalleeOffset(result.code);
				expect(offset).toBeTypeOf('number');
				const lines = result.code.slice(0, offset).split('\n');
				const segments = decodeMappings(result.map.mappings)[lines.length - 1];
				expect(segments).toContainEqual([lines.at(-1)!.length, 0, 2, body.indexOf(factory)]);
				expect(result.map.sourcesContent).toEqual([source]);
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
				else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
			}
		},
	);
});
