import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'octane-virtua-pack-'));
const octaneVersion = JSON.parse(
	await readFile(resolve(packageRoot, '../octane/package.json'), 'utf8'),
).version;

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
	}
	return result.stdout;
}

try {
	run('pnpm', ['pack', '--pack-destination', temporaryRoot], packageRoot);
	const tarball = join(
		temporaryRoot,
		(await readdir(temporaryRoot)).find((name) => name.endsWith('.tgz')),
	);
	const consumer = join(temporaryRoot, 'consumer');
	run('mkdir', ['-p', consumer], temporaryRoot);
	await writeFile(
		join(consumer, 'package.json'),
		JSON.stringify({ name: 'virtua-pack-consumer', private: true, type: 'module' }),
	);
	run(
		'npm',
		[
			'install',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			tarball,
			`octane@${octaneVersion}`,
			'vite@8.1.5',
		],
		consumer,
	);

	const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'));
	for (const forbidden of ['node_modules/react', 'node_modules/react-dom']) {
		if (lock.packages[forbidden]) throw new Error(`Packed production tree includes ${forbidden}`);
	}

	await writeFile(
		join(consumer, 'client.tsrx'),
		`import { VList, Virtualizer, WindowVirtualizer, experimental_VGrid } from '@octanejs/virtua';
export { VList, Virtualizer, WindowVirtualizer, experimental_VGrid };
export function ClientList() { return <VList itemSize={40}><div>one</div></VList>; }
`,
	);
	await writeFile(
		join(consumer, 'server.tsrx'),
		`import { VList, experimental_VGrid as VGrid } from '@octanejs/virtua';
import { renderToStaticMarkup } from 'octane/server';
function App() { return <main><VList ssrCount={2} itemSize={40}><i>A</i><i>B</i><i>C</i></VList><VGrid row={3} col={3} ssrRowCount={2} ssrColCount={2}>{({ rowIndex, colIndex }) => <b>{rowIndex}:{colIndex}</b>}</VGrid></main>; }
export function render() { return renderToStaticMarkup(App).html; }
`,
	);
	await writeFile(
		join(consumer, 'build.mjs'),
		`import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
for (const [name, ssr] of [['client', false], ['server', true]]) {
  await build({ logLevel: 'silent', plugins: [octane({ ssr })], build: { ssr, lib: { entry: name + '.tsrx', formats: ['es'], fileName: () => name + '.js' }, outDir: 'dist/' + name, emptyOutDir: true } });
}
`,
	);
	run('node', ['build.mjs'], consumer);

	const server = await import(pathToFileURL(join(consumer, 'dist/server/server.js')).href);
	const html = server.render();
	if ((html.match(/<i/g) ?? []).length !== 2 || (html.match(/<b/g) ?? []).length !== 4) {
		throw new Error(`Unexpected packed SSR output: ${html}`);
	}

	const clientBundle = await readFile(join(consumer, 'dist/client/client.js'), 'utf8');
	if (/from\s*["']react(?:-dom)?(?:\/|["'])/.test(clientBundle)) {
		throw new Error('Packed client bundle imports React at runtime.');
	}

	console.log('Packed @octanejs/virtua browser and SSR consumers passed without React.');
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
