// Diagnostic for a pre-existing compiler defect. This is not a conformance test:
// it prints the actual server-rendered result for each authored binding name.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { compile } from '../../packages/octane/src/compiler/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const names = [
	'DATA',
	'__props',
	'__s',
	'__extra',
	'__items',
	'__html',
	'Array',
	'__sitem$0',
	'_$ssrHtml',
];
const compiled = new Map();
for (const [index, name] of names.entries()) {
	const source = `const ${name} = [['x', 'FIRST']];\nexport function App() @{ <main>@for (const row of ${name}; key row[0]) { <span>{row[1] as string}</span> }</main> }`;
	compiled.set(
		`\0case-${index}`,
		compile(source, path.join(os.tmpdir(), `collision-${index}.tsrx`), {
			mode: 'server',
			dev: false,
		}).code,
	);
}
const server = await createServer({
	root,
	configFile: false,
	appType: 'custom',
	logLevel: 'silent',
	cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'octane-collision-vite-')),
	server: { middlewareMode: true },
	ssr: { noExternal: true },
	plugins: [
		{
			name: 'ssr-name-collision-repro',
			resolveId(id) {
				if (id.startsWith('virtual:case-')) return '\0' + id.slice(8);
			},
			load(id) {
				return compiled.get(id);
			},
		},
	],
});
try {
	const { renderToString } = await server.ssrLoadModule('/packages/octane/src/server/index.ts');
	for (const [index, name] of names.entries()) {
		const code = compiled.get(`\0case-${index}`);
		const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], {
			input: code,
			encoding: 'utf8',
		});
		if (parsed.status !== 0) {
			console.log(
				JSON.stringify({
					name,
					parseError:
						parsed.stderr.split('\n').find((line) => line.startsWith('SyntaxError:')) ??
						parsed.stderr.split('\n')[0],
				}),
			);
			continue;
		}
		try {
			const module = await server.ssrLoadModule(`virtual:case-${index}`);
			const { html } = renderToString(module.App, { hello: 'world' });
			console.log(JSON.stringify({ name, hasText: html.includes('FIRST'), html }));
		} catch (error) {
			console.log(JSON.stringify({ name, error: String(error) }));
		}
	}
} finally {
	await server.close();
}
