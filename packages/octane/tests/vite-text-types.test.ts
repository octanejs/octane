import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, type Root } from '../src/index.js';
import { renderToString } from 'octane/server';
import { octane } from 'octane/compiler/vite';
import type { Plugin } from 'vite';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';
import { createTextTypeFixture } from './_text-type-project.js';

describe('Vite TypeScript text compilation', () => {
	let root: Root | null = null;
	let container: HTMLElement | null = null;
	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
	});

	it('hydrates and updates typed imported text across production targets', async () => {
		const source = `import type { Label } from './model';
export function App(props: { label: Label }) @{
		<p><i>before</i>{props.label}<i>after</i></p>
}`;
		const fixture = createTextTypeFixture({
			'App.tsrx': source,
			'model.ts': 'export type Label = string;',
		});
		const plugin: Plugin = octane({ hmr: false, textTypes: { tsconfig: fixture.tsconfig } });
		const file = fixture.file('App.tsrx');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await (plugin.config as any)({ root: fixture.directory }, { command: 'build' });
			await (plugin.configResolved as any)({
				root: fixture.directory,
				command: 'build',
				build: {},
				define: {},
			});
			const client = (await (plugin.transform as any).call({}, source, file, { ssr: false }))?.code;
			await (plugin.closeBundle as any)?.();
			const server = (await (plugin.transform as any).call({}, source, file, { ssr: true }))?.code;
			expect(typeof client).toBe('string');
			expect(typeof server).toBe('string');
			const clientApp = evaluateCompiledFixtureCode(client, file, 'client', undefined).App;
			const serverApp = evaluateCompiledFixtureCode(server, file, 'server', undefined).App;
			const { html } = await renderToString(serverApp, { label: 'first' });
			container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const p = container.querySelector('p')!;
			const text = [...p.childNodes].find(
				(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === 'first',
			);
			expect(text).toBeDefined();
			root = hydrateRoot(container, clientApp, { label: 'first' });
			flushSync(() => {});
			flushSync(() => root!.render(clientApp, { label: 'second' }));
			expect(container.querySelector('p')).toBe(p);
			expect(text?.parentNode).toBe(p);
			expect(text?.nodeValue).toBe('second');
			expect(p.textContent).toBe('beforesecondafter');
			expect(error.mock.calls.flat().map(String).join('\n')).not.toMatch(/hydration.*mismatch/i);
		} finally {
			await (plugin.closeBundle as any)?.();
			fixture.dispose();
			error.mockRestore();
		}
	});
});
