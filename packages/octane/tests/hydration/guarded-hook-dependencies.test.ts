import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture';
import { GuardedMemo as PluginMemo } from '../_fixtures/guarded-hook-dependencies.tsrx';

const id = 'guarded-hook-dependencies.tsrx';
const source = readFileSync(resolve('packages/octane/tests/_fixtures', id), 'utf8');
const server = loadCompiledFixtureSource(source, {
	id,
	mode: 'server',
	compileOptions: { hmr: false, dev: false },
});

describe('guarded inferred dependencies across server and client', () => {
	it('renders an absent memo receiver and leaves a disabled effect getter unread', () => {
		expect(renderToString(server.GuardedMemo, { item: undefined }).html).toContain('empty');
		const item = {
			get name() {
				throw new Error('guard bypassed');
			},
		};
		expect(renderToString(server.GuardedGetter, { item, enabled: false, log() {} }).html).toContain(
			'Ready',
		);
	});

	it.each(['plugin', 'production'] as const)(
		'adopts server fallback and updates an optional receiver with the %s client',
		(mode) => {
			const body =
				mode === 'plugin'
					? PluginMemo
					: loadCompiledFixtureSource(source, {
							id,
							mode: 'client',
							compileOptions: { hmr: false, dev: false },
						}).GuardedMemo;
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.GuardedMemo, { item: undefined }).html;
			document.body.append(container);
			const paragraph = container.querySelector('p');
			const root = hydrateRoot(container, body, { item: undefined });
			try {
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph!.textContent).toBe('empty');
				flushSync(() => root.render(body, { item: { name: 'present' } }));
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph!.textContent).toBe('present');
				flushSync(() => root.render(body, { item: undefined }));
				expect(paragraph!.textContent).toBe('empty');
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);
});
