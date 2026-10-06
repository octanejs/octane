import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Plugin, type Rolldown } from 'vite';
import { octane } from 'octane/compiler/vite';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';

// A production build proves imported void components by loading each child
// module during its importer's transform. Component cycles used to deadlock
// that proof (#1741), so every build races a deadline: a hang fails in seconds
// instead of stalling the suite.
const BUILD_DEADLINE = 10_000;
const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ENTRY = (component: string) => `import { createRoot, flushSync } from 'octane';
import ${component} from './${component}.tsrx';
export function run(host) {
	const root = createRoot(host);
	root.render(${component}, { depth: 3 });
	flushSync(() => {});
	const text = host.textContent;
	root.unmount();
	return { text, empty: host.childNodes.length === 0 };
}
`;

// Each component renders the next one while `depth` lasts; the last one
// renders the first again when the graph is cyclic.
function components(names: string[], cyclic: boolean) {
	const files: Record<string, string> = {};
	names.forEach((name, index) => {
		const next = cyclic || index < names.length - 1 ? names[(index + 1) % names.length] : null;
		files[`${name}.tsrx`] =
			(next === null ? '' : `import ${next} from './${next}.tsrx';\n`) +
			`export default function ${name}({ depth }) @{\n` +
			`\t<main><span>${name}</span>` +
			(next === null ? '' : `@if (depth > 0) { <${next} depth={depth - 1} /> }`) +
			`</main>\n}\n`;
	});
	return files;
}

function fixture(files: Record<string, string>) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-void-cycles-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(PACKAGE_ROOT, join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	for (const [file, source] of Object.entries(files)) writeFileSync(join(root, file), source);
	return root;
}

async function buildFixture(root: string, inputs: string[], plugins: Plugin[] = []) {
	const compiled: Record<string, string> = {};
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Vite build did not finish within ${BUILD_DEADLINE}ms.`)),
			BUILD_DEADLINE,
		);
	});
	try {
		const result = await Promise.race([
			build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [
					octane({ hmr: false }),
					...plugins,
					{
						name: 'capture-compiled-modules',
						transform(code, id) {
							if (id.startsWith(root + '/')) compiled[id.slice(root.length + 1)] = code;
						},
					},
				],
				build: {
					write: false,
					minify: false,
					// Library mode keeps each entry's exports for the test to call.
					lib: {
						entry: Object.fromEntries(inputs.map((input) => [input, join(root, input)])),
						formats: ['es'],
					},
					rolldownOptions: { external: (id) => id === 'octane' || id.startsWith('octane/') },
				},
			}),
			deadline,
		]);
		const output = (Array.isArray(result) ? result : [result]).flatMap((item) => {
			if (!('output' in item)) throw new Error('Expected a one-shot Vite build.');
			return item.output;
		});
		const chunks = output.filter(
			(item): item is Rolldown.OutputChunk => item.type === 'chunk' && item.isEntry,
		);
		return { compiled, chunks };
	} finally {
		clearTimeout(timer);
	}
}

function run(chunk: Rolldown.OutputChunk) {
	const fixtureModule = evaluateCompiledFixtureCode(
		chunk.code,
		chunk.fileName,
		'client',
		undefined,
	);
	const host = document.createElement('div');
	document.body.append(host);
	try {
		return fixtureModule.run(host);
	} finally {
		host.remove();
	}
}

describe('production Vite void-component proofs across import cycles', { timeout: 30_000 }, () => {
	it('specializes an acyclic component chain', async () => {
		const root = fixture({ ...components(['A', 'B'], false), 'entry.ts': ENTRY('A') });
		const { compiled, chunks } = await buildFixture(root, ['entry.ts']);
		expect(compiled['entry.ts']).toContain('__createVoidRoot');
		expect(compiled['A.tsrx']).toContain('componentSlotVoid(');
		expect(run(chunks[0])).toEqual({ text: 'AB', empty: true });
	});

	it('builds and renders mutually recursive components', async () => {
		const root = fixture({ ...components(['A', 'B'], true), 'entry.ts': ENTRY('A') });
		const { compiled, chunks } = await buildFixture(root, ['entry.ts']);
		// The entry's import is outside the cycle, so its proof still applies.
		expect(compiled['entry.ts']).toContain('__createVoidRoot');
		expect(run(chunks[0])).toEqual({ text: 'ABAB', empty: true });
	});

	it('builds and renders a three-component cycle', async () => {
		const root = fixture({ ...components(['A', 'B', 'C'], true), 'entry.ts': ENTRY('A') });
		const { compiled, chunks } = await buildFixture(root, ['entry.ts']);
		expect(compiled['entry.ts']).toContain('__createVoidRoot');
		expect(run(chunks[0])).toEqual({ text: 'ABCA', empty: true });
	});

	it('compiles concurrent entries into one cycle like a single entry', async () => {
		const files = components(['A', 'B'], true);
		const single = await buildFixture(fixture({ ...files, 'entry.ts': ENTRY('A') }), ['entry.ts']);
		const concurrent = await buildFixture(
			fixture({
				...files,
				'entry.ts': ENTRY('A'),
				'other.ts': "export { default as B } from './B.tsrx';\n",
			}),
			['entry.ts', 'other.ts'],
		);
		expect(concurrent.chunks.map((chunk) => chunk.name).sort()).toEqual(['entry.ts', 'other.ts']);
		for (const file of ['entry.ts', 'A.tsrx', 'B.tsrx']) {
			expect(concurrent.compiled[file]).toBe(single.compiled[file]);
		}
	});

	it('proves a shared child for every importer that reaches it concurrently', async () => {
		const section = (name: string) =>
			`import Shared from './Shared.tsrx';\n` +
			`export default function ${name}({ depth }) @{ <section><Shared depth={depth} /></section> }\n`;
		const files = {
			...components(['Shared', 'L1', 'L2', 'L3', 'L4'], false),
			'Left.tsrx': section('Left'),
			'Right.tsrx': section('Right'),
			'Mid.tsrx':
				"import Right from './Right.tsrx';\n" +
				'export default function Mid({ depth }) @{ <article><Right depth={depth} /></article> }\n',
			'Page.tsrx':
				"import Left from './Left.tsrx';\nimport Mid from './Mid.tsrx';\n" +
				'export default function Page({ depth }) @{ <div><Left depth={depth} /><Mid depth={depth} /></div> }\n',
		};
		const shared = await buildFixture(fixture({ ...files, 'entry.ts': ENTRY('Page') }), [
			'entry.ts',
		]);
		// Each importer compiles exactly as it does when it is the child's only importer.
		for (const importer of ['Left', 'Right']) {
			const alone = await buildFixture(fixture({ ...files, 'entry.ts': ENTRY(importer) }), [
				'entry.ts',
			]);
			expect(shared.compiled[`${importer}.tsrx`]).toBe(alone.compiled[`${importer}.tsrx`]);
		}
		expect(run(shared.chunks[0])).toEqual({ text: 'SharedL1L2L3SharedL1L2L3', empty: true });
	});

	it('compiles a cycle the same way whichever member the build reaches first', async () => {
		const files = components(['A', 'B', 'C'], true);
		const outputs = [];
		for (const first of ['A', 'B', 'C']) {
			const root = fixture({ ...files, 'entry.ts': ENTRY(first) });
			const { compiled } = await buildFixture(root, ['entry.ts']);
			outputs.push([compiled['A.tsrx'], compiled['B.tsrx'], compiled['C.tsrx']]);
		}
		expect(outputs[1]).toEqual(outputs[0]);
		expect(outputs[2]).toEqual(outputs[0]);
	});
});

// Vite's own TypeScript transform reprints every `.ts`/`.tsx` module after the
// Octane pre-transform, so a `.tsx` component's final code never equals the
// compiled code byte for byte. The proof compares the parsed program instead,
// and still fails closed when a later transform changes that program.
describe(
	'production Vite void-component proofs for TypeScript modules',
	{ timeout: 30_000 },
	() => {
		const files = {
			// Branch returns of distinct host roots lower to a void body.
			'A.tsx':
				"import B from './B.tsx';\n" +
				'export default function A({ depth }: { depth: number }) {\n' +
				'\tif (depth < 0) return <p>none</p>;\n' +
				'\treturn <main><span>A</span><B depth={depth} /></main>;\n' +
				'}\n',
			'B.tsx':
				'export default function B({ depth }: { depth: number }) {\n' +
				'\tif (depth > 9) return <p>deep</p>;\n' +
				'\treturn <section>{String(depth)}</section>;\n' +
				'}\n',
			'entry.ts': `import { createRoot, flushSync } from 'octane';
import A from './A.tsx';
export function run(host) {
	const root = createRoot(host);
	root.render(A, { depth: 3 });
	flushSync(() => {});
	const text = host.textContent;
	root.unmount();
	return { text, empty: host.childNodes.length === 0 };
}
`,
		};

		it('proves void .tsx components after the TypeScript reprint', async () => {
			const { compiled, chunks } = await buildFixture(fixture(files), ['entry.ts']);
			expect(compiled['entry.ts']).toContain('__createVoidRoot');
			expect(compiled['A.tsx']).toContain('componentSlotVoid(');
			expect(run(chunks[0])).toEqual({ text: 'A3', empty: true });
		});

		it('keeps the generic paths when a later transform changes the component program', async () => {
			const rewrite: Plugin = {
				name: 'rewrite-component-program',
				transform(code, id) {
					if (id.endsWith('/A.tsx') || id.endsWith('/B.tsx'))
						return `${code}\nexport const rewritten = true;\n`;
				},
			};
			const { compiled, chunks } = await buildFixture(fixture(files), ['entry.ts'], [rewrite]);
			expect(compiled['entry.ts']).not.toContain('__createVoidRoot');
			expect(compiled['A.tsx']).not.toContain('componentSlotVoid(');
			expect(run(chunks[0])).toEqual({ text: 'A3', empty: true });
		});
	},
);
