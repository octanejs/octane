import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// Dumps the compiled output for every .tsrx file under a playground's ./src so
// you can eyeball what the compiler emits. Resolve the target package relative
// to the playground that invoked this script (process.cwd()), not relative to
// scripts/, because the playground's `vyre` dependency is linked into its own
// local node_modules.
const require = createRequire(path.join(process.cwd(), 'package.json'));
const package_name = process.argv[3] ?? 'vyre/compiler';
const pkg = require(package_name);
const { compile } = pkg;
const compile_to_volar_mappings = pkg.compile_to_volar_mappings ?? pkg.compileToVolarMappings;
const FILE_EXTENSIONS = ['.tsrx'];

// vyre/compiler (and @tsrx/ripple) accept a { mode } option and emit a distinct
// server build; other targets compile client-only.
const supportsServer = package_name === 'vyre/compiler' || package_name === '@tsrx/ripple';

let mode_type = process.argv[2] || 'client';

if (!supportsServer && mode_type === 'server') {
	console.error(`Warning: 'server' mode is not applicable for ${package_name}. Using 'client'.`);
	mode_type = 'client';
}

if (mode_type !== 'client' && mode_type !== 'server' && mode_type !== 'all' && mode_type !== 'tsx') {
	console.error(`Invalid mode: ${mode_type}. Must be 'client', 'server', 'all', or 'tsx'.`);
	process.exit(1);
}
console.log(`Compiling in ${mode_type} mode...`);

const compile_modes =
	mode_type === 'all'
		? supportsServer
			? ['server', 'client', 'tsx']
			: ['client', 'tsx']
		: [mode_type];

const files = (await fs.readdir('./src/')).filter((file) =>
	FILE_EXTENSIONS.some((extension) => file.endsWith(extension)),
);

for (const mode of compile_modes) {
	const output_dir = `./debug/${mode}`;
	await fs.rm(output_dir, { recursive: true, force: true });
	await fs.mkdir(output_dir, { recursive: true });

	for (const filename of files) {
		const source = await fs.readFile(path.join('./src/', filename), 'utf-8');
		const base_name = filename.slice(0, -path.extname(filename).length);
		const file_path = `${output_dir}/${base_name}`;

		if (mode !== 'tsx') {
			const result = compile(source, filename, supportsServer ? { mode } : undefined);
			await fs.writeFile(`${file_path}.js`, result.code);
			if (result.css) {
				await fs.writeFile(`${file_path}.css`, result.css);
			}
		} else {
			const result = compile_to_volar_mappings(source, filename, { loose: true });
			await fs.writeFile(`${file_path}.tsx`, result.code);
			await fs.writeFile(`${file_path}.mappings.json`, JSON.stringify(result.mappings, null, 2));
		}
	}
}
