// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { parseAst } from 'vite';
import { compile } from 'octane/compiler';

// Octane parses with the native `@tsrx/oxc` parser and falls back to the
// JavaScript parser (also the browser compiler's only parser), so every case
// runs through both.
const parser = vi.hoisted(() => ({ javascript: false }));
vi.mock('../../src/compiler/parser.node.js', async (importOriginal) => {
	const native = await importOriginal<typeof import('../../src/compiler/parser.node.js')>();
	const javascript = await import('../../src/compiler/parser.browser.js');
	return {
		...native,
		parseModule: (...args: Parameters<typeof native.parseModule>) =>
			(parser.javascript ? javascript.parseModule : native.parseModule)(...args),
	};
});
afterEach(() => {
	parser.javascript = false;
});

const PARSERS = ['native', 'javascript'] as const;
const MODES = ['client', 'server'] as const;

// `values.mjs` exports values only and `types.mjs` does not exist, as after any
// TypeScript build: a type that survives as a value import or re-export fails
// to link, and leftover type syntax fails to parse.
const SOURCE = `import type { Foo } from './types.mjs';
import { type Bar, baz } from './values.mjs';
export type { Foo };
export type * from './types.mjs';
export type * as Types from './types.mjs';
export { type Bar, Foo as Renamed };

class Base<T> {
	constructor(readonly value: T) {}
}
export class Square extends Base<number> {
	declare kind: 'square';
	constructor(public side: Bar) {
		super(side * side);
	}
}
export const area = (<Square>new Square(baz)).value;
`;

const directory = mkdtempSync(join(tmpdir(), 'octane-ts-erasure-'));
writeFileSync(join(directory, 'values.mjs'), 'export const baz = 3;\n');
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function compileWith(parserName: string, source: string, filename: string, options: object) {
	parser.javascript = parserName === 'javascript';
	return compile(source, filename, { hmr: false, ...options }).code;
}

// Import the compiled module with Node itself: real ESM linking, and Node's
// own parser rejects any leftover type syntax.
function evaluate(code: string, name: string, report: string) {
	writeFileSync(join(directory, name), code);
	const run = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`const m = await import('./${name}');\nconsole.log(JSON.stringify(${report}));`,
		],
		{ cwd: directory, encoding: 'utf8' },
	);
	expect(run.stderr).toBe('');
	return JSON.parse(run.stdout);
}

function moduleRecord(code: string) {
	const imports: string[] = [];
	const exports: string[] = [];
	for (const node of parseAst(code, { lang: 'js' }).body as any[]) {
		if (node.type === 'ImportDeclaration') {
			for (const specifier of node.specifiers) {
				imports.push(`${specifier.local.name} from ${node.source.value}`);
			}
		} else if (node.type === 'ExportAllDeclaration') {
			exports.push(`* from ${node.source.value}`);
		} else if (node.type === 'ExportNamedDeclaration') {
			for (const specifier of node.specifiers) exports.push(specifier.exported.name);
			const declaration = node.declaration;
			if (declaration?.id) exports.push(declaration.id.name);
			for (const item of declaration?.declarations ?? []) exports.push(item.id.name);
		}
	}
	return { imports, exports };
}

describe('compile() erases TypeScript-only syntax from .ts modules', () => {
	for (const parserName of PARSERS) {
		for (const mode of MODES) {
			it(`links and evaluates as plain JavaScript (${parserName} parser, ${mode})`, () => {
				const code = compileWith(parserName, SOURCE, '/src/shapes.ts', { mode });
				const report = `{
					exports: Object.keys(m).sort(),
					area: m.area,
					side: new m.Square(2).side,
					value: new m.Square(2).value,
					declared: 'kind' in new m.Square(2),
				}`;
				expect(evaluate(code, `shapes-${parserName}-${mode}.mjs`, report)).toEqual({
					exports: ['Square', 'area'],
					area: 9,
					side: 2,
					value: 4,
					declared: false,
				});
			});
		}

		it(`keeps a re-export whose type name also declares a value (${parserName} parser)`, () => {
			const code = compileWith(
				parserName,
				`import type { Foo } from './types.mjs';
				interface Shape { sides: number }
				const Shape = { sides: 4 };
				export { Foo, Shape };`,
				'/src/merged.ts',
				{ mode: 'client' },
			);
			expect(evaluate(code, `merged-${parserName}.mjs`, '{ ...m }')).toEqual({
				Shape: { sides: 4 },
			});
		});

		it(`erases type-only imports from a Valdi custom hook (${parserName} parser)`, () => {
			const code = compileWith(
				parserName,
				`import { useState } from 'octane';
				import type { Label } from './types.mjs';
				import { type Format, format } from './values.mjs';
				export type { Label };
				export { type Format };
				export function useLabel(initial: Label, apply: Format = format) {
					const [label, setLabel] = useState<Label>(initial);
					return [apply(label), setLabel] as const;
				}`,
				'/src/useLabel.ts',
				{
					renderer: {
						id: 'native',
						module: '@test/valdi-writer',
						target: 'valdi',
						server: 'unsupported',
						text: 'reject',
					},
				},
			);
			const { imports, exports } = moduleRecord(code);
			expect(imports.filter((entry) => !entry.endsWith(' from @test/valdi-writer'))).toEqual([
				'format from ./values.mjs',
			]);
			expect(exports).toEqual(['useLabel']);
		});
	}

	// Native .tsx and .tsrx already kept their types; the same erasure gaps
	// (heritage type arguments, re-exported type names) applied to them.
	for (const filename of ['/src/Shapes.tsx', '/src/Shapes.tsrx']) {
		it(`erases heritage type arguments and type re-exports in ${filename}`, () => {
			const code = compileWith(
				'native',
				`import type { Foo } from './types.mjs';
				class Base<T> {}
				export class Square extends Base<number> {}
				export { Foo };`,
				filename,
				{ mode: 'client' },
			);
			const name = `heritage${filename.slice(filename.lastIndexOf('.'))}.mjs`;
			expect(evaluate(code, name, 'Object.keys(m)')).toEqual(['Square']);
		});
	}
});
