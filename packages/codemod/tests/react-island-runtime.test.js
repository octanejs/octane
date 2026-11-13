import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { runCodemod } from '../dist/index.js';
import { bundleRuntime, installDOM } from './bundle-runtime.js';

it('passes literal boolean and null children through a React island', async () => {
	const project = await mkdtemp(path.join(os.tmpdir(), 'octane-island-children-'));
	const dom = installDOM();
	try {
		const peers = path.join(import.meta.dirname, '../node_modules');
		const modules = path.join(project, 'node_modules');
		const pkg = path.join(modules, 'leaf-kit');
		await mkdir(pkg, { recursive: true });
		await Promise.all(
			['react', 'react-dom', 'octane'].map((name) =>
				symlink(path.join(peers, name), path.join(modules, name), 'dir'),
			),
		);
		const source = (children) => `import { Leaf } from 'leaf-kit';
			export const App = () => <section>${children}</section>;`;
		const files = {
			'package.json': '{}',
			'tsconfig.json':
				'{"compilerOptions":{"strict":true,"jsx":"react-jsx","moduleResolution":"bundler"}}',
			'node_modules/leaf-kit/package.json':
				'{"name":"leaf-kit","type":"module","main":"index.js","peerDependencies":{"react":"^19.2.0"}}',
			'node_modules/leaf-kit/index.js': `import { createElement } from 'react';
				export function Leaf(props) {
					const child = Object.hasOwn(props, 'children') ? JSON.stringify(props.children) : 'absent';
					return createElement('output', null, child);
				}`,
			'App.tsx': source(
				'<Leaf /> <Leaf>{true}</Leaf> <Leaf>\n  {/* Keep the child. */}\n  {(false)}\n</Leaf> <Leaf>{null}</Leaf>',
			),
			'Fragment.tsx': source('<Leaf><>{false}</></Leaf>'),
			'Mixed.tsx': source('<Leaf>{false}\n  \u00a0\n</Leaf>'),
		};
		await Promise.all(
			Object.entries(files).map(([name, code]) => writeFile(path.join(project, name), code)),
		);
		const inputs = ['App.tsx', 'Fragment.tsx', 'Mixed.tsx'].map((name) => path.join(project, name));
		let code;
		for (const projectTypes of [false, true]) {
			const { files: report } = await runCodemod(inputs, {
				root: project,
				write: false,
				strong: true,
				projectTypes,
			});
			const app = report.find((file) => file.file === 'App.tsx');
			expect([...app.notes, ...app.diagnostics]).toEqual([]);
			for (const name of ['Fragment.tsx', 'Mixed.tsx'])
				expect(report.find((file) => file.file === name).notes).toContainEqual(
					expect.objectContaining({ rule: 'bindings', severity: 'error' }),
				);
			code = app.code;
		}
		await writeFile(path.join(project, 'App.tsrx'), code);
		const expected = ['absent', 'true', 'false', 'null'];
		const outputs = (host) => [...host.querySelectorAll('output')].map((node) => node.textContent);
		const server = await bundleRuntime(
			project,
			'server',
			"export { App } from './App.tsrx'; export { prerender } from 'octane/static';",
		);
		const host = document.createElement('div');
		host.innerHTML = (await server.prerender(server.App)).html;
		expect(outputs(host)).toEqual(expected);

		const client = await bundleRuntime(
			project,
			'client',
			"export { App } from './App.tsrx'; export { createRoot } from 'octane'; export { act } from 'react';",
		);
		host.replaceChildren();
		const root = client.createRoot(host);
		try {
			await client.act(() => root.render(client.App));
			expect(outputs(host)).toEqual(expected);
		} finally {
			await client.act(() => root.unmount());
		}
	} finally {
		dom.window.close();
		vi.unstubAllGlobals();
		await rm(project, { recursive: true, force: true });
	}
});
