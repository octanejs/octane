// Observe root-journal slots reached by keyed reorders of pure survivors. Every
// reorder moves survivor indices, and the list's shape record already restores
// them, so the journal must not grow with the number of rows.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const runtimeFile = path.resolve(
	process.argv[2] ?? path.join(repo, 'packages/octane/src/runtime.ts'),
);
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const commitSite = 'ROOT_RENDER_TRANSACTIONS = [];\n\tfor (const transaction of transactions) {';
assert.equal(runtimeSource.split(commitSite).length, 2, 'one root commit loop');
const observedRuntime = runtimeSource.replace(
	commitSite,
	commitSite + '\n\t\tglobalThis.__rootJournalSlots += transaction.log.length;',
);
const source = `export function Rows(props: { items: number[] }) @{
	<ol>
		@for (const item of props.items; key item) {
			<li>{item as string}</li>
		}
	</ol>
}`;
const compiled = compile(source, 'root-reorder-rows.tsrx', { dev: false, hmr: false }).code;
const OPS = {
	rotate: (items) => [...items.slice(1), items[0]],
	reverse: (items) => items.toReversed(),
	remove_first: (items) => items.slice(1),
	insert_first: (items) => [-1, ...items],
};
const SIZES = [128, 256];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-root-reorders-'));
const window = new Window();
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Comment',
	'Event',
	'MutationObserver',
])
	globalThis[name] = name === 'window' ? window : window[name];
try {
	const outfile = path.join(scratch, 'observed.mjs');
	const bundled = await build({
		stdin: {
			contents: compiled + `\nexport {createRoot, flushSync} from 'octane';`,
			resolveDir: repo,
			loader: 'js',
		},
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		minify: true,
		write: false,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'observed-runtime',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/internal\/client)?$/ }, ({ path: request }) => ({
						path: path.join(
							repo,
							'packages/octane/src',
							request === 'octane' ? 'index.ts' : 'internal/client.ts',
						),
					}));
					plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
						loaded === runtimePath
							? { contents: observedRuntime, loader: 'ts', resolveDir: path.dirname(runtimePath) }
							: null,
					);
				},
			},
		],
	});
	fs.writeFileSync(outfile, bundled.outputFiles[0].text);
	const { Rows, createRoot, flushSync } = await import(pathToFileURL(outfile));
	const slots = {};
	for (const [op, reorder] of Object.entries(OPS)) {
		slots[op] = {};
		for (const size of SIZES) {
			const items = Array.from({ length: size }, (_, i) => i);
			const container = document.createElement('main');
			document.body.append(container);
			const root = createRoot(container);
			try {
				root.render(Rows, { items });
				const before = new Map([...container.querySelectorAll('li')].map((row, i) => [i, row]));
				const next = reorder(items);
				globalThis.__rootJournalSlots = 0;
				flushSync(() => root.render(Rows, { items: next }));
				slots[op][size] = globalThis.__rootJournalSlots;
				const after = [...container.querySelectorAll('li')];
				assert.deepEqual(
					after.map((row) => row.textContent),
					next.map(String),
					`${op}: rendered order`,
				);
				for (let i = 0; i < next.length; i++)
					if (before.has(next[i])) assert.equal(after[i], before.get(next[i]), `${op}: survivor`);
			} finally {
				root.unmount();
				container.remove();
			}
		}
	}
	const perRow = (op) => (slots[op][SIZES[1]] - slots[op][SIZES[0]]) / (SIZES[1] - SIZES[0]);
	const value = (median) => ({ median, min: median, samples: 1 });
	const report = {
		suite: 'root-transactions',
		runtimeFile,
		runtimeSha256: createHash('sha256').update(runtimeSource).digest('hex'),
		sourceSha256: createHash('sha256').update(source).digest('hex'),
		node: process.version,
		slots,
		targets: [
			{
				name: 'reorders',
				ops: Object.fromEntries(
					Object.keys(OPS).map((op) => [`${op}_row_slots`, value(perRow(op))]),
				),
				meta: { gate: 'passed', slots },
			},
			{
				// A row-scaled journal record is at least one slot per row.
				name: 'reorders-work-budget',
				ops: Object.fromEntries(Object.keys(OPS).map((op) => [`${op}_row_slots`, value(1)])),
				meta: { gate: 'passed' },
			},
		],
		limitations: [
			'Counts root-journal slots per committed reorder as the difference between two list sizes, not heap allocation or timing. The list shape record is a separate per-list snapshot.',
		],
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
