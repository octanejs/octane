import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import defaultTypeScript from 'typescript';

const execFileAsync = promisify(execFile);
const consumerFixture = new URL(
	'../packages/octane/typetests/compiler-valdi-adapter.test-d.ts',
	import.meta.url,
);

/** Check the shipped contract without installing peers or resolving workspace source. */
export async function checkPackedValdiContract(
	archive,
	{ typescript: ts = defaultTypeScript } = {},
) {
	assert.equal(typeof archive, 'string', 'The packed Octane archive is required');
	const directory = await realpath(
		await mkdtemp(path.join(tmpdir(), 'octane-packed-valdi-contract-')),
	);
	try {
		const packageDirectory = path.join(directory, 'node_modules/octane');
		await mkdir(packageDirectory, { recursive: true });
		await execFileAsync('tar', [
			'-xzf',
			path.resolve(archive),
			'-C',
			packageDirectory,
			'--strip-components=1',
		]);
		const manifest = JSON.parse(
			await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
		);
		assert.equal(manifest.name, 'octane');
		const declaration = await realpath(path.join(packageDirectory, 'dist/compiler/valdi.d.ts'));
		const consumer = path.join(directory, 'consumer.ts');
		await writeFile(consumer, await readFile(consumerFixture, 'utf8'));
		await writeFile(
			path.join(directory, 'package.json'),
			JSON.stringify({ private: true, type: 'module' }),
		);
		const lanes = [
			['Bundler', ts.ModuleKind.ESNext, ts.ModuleResolutionKind.Bundler],
			['NodeNext', ts.ModuleKind.NodeNext, ts.ModuleResolutionKind.NodeNext],
			['Node10', ts.ModuleKind.CommonJS, ts.ModuleResolutionKind.Node10],
		];
		for (const [name, module, moduleResolution] of lanes) {
			const options = {
				module,
				moduleResolution,
				target: ts.ScriptTarget.ES2020,
				lib: ['lib.es2020.d.ts'],
				types: [],
				strict: true,
				noEmit: true,
				skipLibCheck: false,
			};
			// The narrow legacy mapping must preserve the package's existing root types.
			const root = ts.resolveModuleName('octane', consumer, options, ts.sys).resolvedModule;
			assert.ok(root, `${name}: the existing Octane root must still resolve`);
			assert.equal(
				await realpath(root.resolvedFileName),
				await realpath(path.join(packageDirectory, manifest.types)),
			);
			const resolved = ts.resolveModuleName(
				'octane/compiler/valdi',
				consumer,
				options,
				ts.sys,
			).resolvedModule;
			assert.ok(resolved, `${name}: the public Valdi contract must resolve from the tarball`);
			assert.equal(
				await realpath(resolved.resolvedFileName),
				declaration,
				`${name}: expected the packed dist declaration`,
			);
			const program = ts.createProgram({ rootNames: [consumer], options });
			const diagnostics = ts.getPreEmitDiagnostics(program);
			assert.equal(
				diagnostics.length,
				0,
				`${name} (TypeScript ${ts.version}):\n${ts.formatDiagnostics(diagnostics, {
					getCurrentDirectory: () => directory,
					getCanonicalFileName: (file) => file,
					getNewLine: () => '\n',
				})}`,
			);
			assert.ok(
				program.getSourceFiles().some((file) => path.resolve(file.fileName) === declaration),
			);
			for (const file of program.getSourceFiles()) {
				if (program.isSourceFileDefaultLibrary(file)) {
					assert.doesNotMatch(path.basename(file.fileName), /^lib\.(?:dom|webworker)(?:\.|$)/);
					continue;
				}
				const relative = path.relative(directory, await realpath(file.fileName));
				assert.ok(
					!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
					`${name}: declaration escaped the packed consumer: ${file.fileName}`,
				);
			}
		}
		console.log(
			`packed Valdi contract passed: TypeScript ${ts.version}, Bundler/NodeNext/Node10, no DOM or Node ambient types`,
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv.length !== 3)
		throw new Error('Usage: node scripts/check-packed-valdi-contract.mjs /path/to/octane.tgz');
	await checkPackedValdiContract(process.argv[2]);
}
