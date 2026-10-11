import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot, type ComponentBody, type Root } from '../../src/index.js';
import {
	App as PluginApp,
	type CompositionProps,
} from '../_fixtures/static-component-composition.tsrx';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const filename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/static-component-composition.tsrx',
);
const source = readFileSync(filename, 'utf8');
const server = loadCompiledFixtureSource(source, {
	id: filename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const production = loadCompiledFixtureSource(source, {
	id: filename,
	mode: 'client',
	compileOptions: { dev: false, hmr: false },
});
const development = loadCompiledFixtureSource(source, {
	id: filename,
	mode: 'client',
	compileOptions: { dev: true, hmr: false },
});

describe('static component composition hydration', () => {
	// PluginApp uses the real project's compile mode: development with HMR in
	// octane, and production in octane-prod. The explicit development module
	// separately covers dev output without HMR wrapping.
	it.each([
		['production', production.App],
		['development', development.App],
		['project plugin', PluginApp],
	] as const)(
		'adopts production HTML with the %s client and retains live controls',
		async (_mode, body) => {
			const picked: number[] = [];
			const props: CompositionProps = {
				rows: [{ id: 1 }, { id: 2 }],
				tick: 0,
				onPick: (id) => picked.push(id),
			};
			const { html } = await renderToString(server.App, props);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const elements = Array.from(container.querySelectorAll('*'));
			const texts = Array.from(
				container.querySelectorAll('[data-label]'),
				(node) => node.firstChild,
			);
			const input = container.querySelector('input')!;
			input.value = 'typed before hydration';
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let root: Root | undefined;
			try {
				root = hydrateRoot(container, body as ComponentBody<CompositionProps>, props);
				flushSync(() => {});
				const adopted = Array.from(container.querySelectorAll('*'));
				expect(adopted).toHaveLength(elements.length);
				adopted.forEach((node, index) => expect(node).toBe(elements[index]));
				Array.from(container.querySelectorAll('[data-label]')).forEach((node, index) => {
					expect(node.textContent).toBe('fixed');
					expect(node.firstChild).toBe(texts[index]);
				});
				expect(input.value).toBe('typed before hydration');
				flushSync(() =>
					root!.render(body as ComponentBody<CompositionProps>, { ...props, tick: 1 }),
				);
				expect(container.querySelector('main')!.getAttribute('data-tick')).toBe('1');
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed before hydration');
				flushSync(() => container.querySelector('button')!.click());
				expect(picked).toEqual([1]);
				expect(errors.mock.calls).toEqual([]);
				expect(warnings.mock.calls).toEqual([]);
			} finally {
				try {
					root?.unmount();
				} finally {
					container.remove();
					errors.mockRestore();
					warnings.mockRestore();
				}
			}
			expect(container.childNodes).toHaveLength(0);
		},
	);
});
