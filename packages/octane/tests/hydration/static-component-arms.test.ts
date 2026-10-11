import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, type Root } from 'octane';
import { renderToString } from 'octane/server';
import * as PluginFixture from '../_fixtures/static-component-arms.tsrx';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const filename = join(process.cwd(), 'packages/octane/tests/_fixtures/static-component-arms.tsrx');
const source = readFileSync(filename, 'utf8');
const server = loadCompiledFixtureSource<typeof PluginFixture>(source, {
	id: filename,
	mode: 'server',
	compileOptions: { dev: false, hmr: false },
});
const clients = [
	...[false, true].map((dev) => ({
		name: dev ? 'development' : 'production',
		module: loadCompiledFixtureSource<typeof PluginFixture>(source, {
			id: filename,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		}),
	})),
	// The development project compiles this import with HMR; the production
	// project supplies production output. This covers startup adoption, not a hot update.
	{ name: 'project plugin', module: PluginFixture },
];

it.each(clients)(
	'adopts static branches beside live state and drafts ($name client)',
	async ({ module: client }) => {
		const props = { visible: true, selected: 'shown', tick: 0 };
		server.configureRead(() => 'initial');
		client.configureRead(() => 'initial');
		const container = document.createElement('div');
		container.innerHTML = (await renderToString(server.App, props)).html;
		document.body.appendChild(container);
		const elements = Array.from(container.querySelectorAll('*'));
		const bodies = Array.from(container.querySelectorAll('.static-child'));
		expect(bodies.map((body) => body.parentElement?.className)).toEqual([
			'static-if',
			'static-case',
			'static-default',
		]);
		const spans = bodies.map((body) => body.querySelector('span')!);
		const texts = spans.map((span) => span.firstChild);
		texts.forEach((text) => expect(text?.nodeType).toBe(Node.TEXT_NODE));
		const stateful = container.querySelector('.stateful')!;
		const button = stateful.querySelector('button')!;
		const buttonText = Array.from(button.childNodes).find(
			(node) => node.nodeType === Node.TEXT_NODE,
		)!;
		expect(buttonText).toBeDefined();
		const input = stateful.querySelector('input')!;
		input.value = 'server draft';
		const recovery: unknown[] = [];
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let root: Root | undefined;
		const expectAdopted = () => {
			const current = Array.from(container.querySelectorAll('*'));
			expect(current).toHaveLength(elements.length);
			current.forEach((node, index) => expect(node).toBe(elements[index]));
			spans.forEach((span, index) => expect(span.firstChild).toBe(texts[index]));
			expect(Array.from(button.childNodes)).toContain(buttonText);
			expect(input.value).toBe('server draft');
		};
		try {
			flushSync(() => {
				root = hydrateRoot(container, client.App, props, {
					onRecoverableError: (error) => recovery.push(error),
				});
			});
			await Promise.resolve();
			expectAdopted();
			flushSync(() => button.click());
			client.configureRead(() => 'updated');
			flushSync(() => root!.render(client.App, { ...props, tick: 1 }));
			expectAdopted();
			expect(button.textContent).toBe('1');
			expect(container.querySelector('.setup')!.textContent).toBe('updated');
			expect(container.querySelector('.dynamic')!.textContent).toBe('updated');
			flushSync(() => root!.render(client.App, { visible: false, selected: 'hidden', tick: 2 }));
			expect(container.querySelector('.static-child')).toBeNull();
			bodies.forEach((body) => expect(body.isConnected).toBe(false));
			flushSync(() => button.click());
			flushSync(() => root!.render(client.App, { ...props, tick: 3 }));
			const remounted = Array.from(container.querySelectorAll('.static-child'));
			expect(remounted).toHaveLength(bodies.length);
			remounted.forEach((body, index) => {
				expect(body).not.toBe(bodies[index]);
				expect(body.querySelector('span')!.textContent).toBe('fixed');
			});
			expect(container.querySelector('.stateful')).toBe(stateful);
			expect(stateful.querySelector('button')).toBe(button);
			expect(Array.from(button.childNodes)).toContain(buttonText);
			expect(button.textContent).toBe('2');
			expect(stateful.querySelector('input')).toBe(input);
			expect(input.value).toBe('server draft');
			expect(recovery).toEqual([]);
			expect(errors.mock.calls).toEqual([]);
			expect(warnings.mock.calls).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
			client.configureRead(() => 'initial');
			errors.mockRestore();
			warnings.mockRestore();
		}
		expect(container.childNodes).toHaveLength(0);
	},
);
