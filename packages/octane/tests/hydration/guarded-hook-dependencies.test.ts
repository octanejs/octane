import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture';
import {
	GuardedMemo as PluginMemo,
	GuardedOptionalProp as PluginOptionalProp,
} from '../_fixtures/guarded-hook-dependencies.tsrx';

const id = 'guarded-hook-dependencies.tsrx';
const source = readFileSync(resolve('packages/octane/tests/_fixtures', id), 'utf8');
const server = loadCompiledFixtureSource(source, {
	id,
	mode: 'server',
	compileOptions: { hmr: false, dev: false },
});

describe('guarded inferred dependencies across server and client', () => {
	it.each([false, true])(
		'renders optional-chain reads unread while the receiver is absent (dev=%s)',
		(dev) => {
			const compiled =
				dev === false
					? server
					: loadCompiledFixtureSource(source, {
							id,
							mode: 'server',
							compileOptions: { hmr: false, dev },
						});
			const throwing = {
				get label(): string {
					throw new Error('skipped optional-chain read');
				},
			};
			for (const name of ['GuardedOptionalProp', 'GuardedOptionalCall', 'GuardedOptionalKey']) {
				for (const options of [undefined, null, throwing]) {
					expect(renderToString(compiled[name], { run: undefined, options }).html).toContain(
						'<p>idle</p>',
					);
				}
			}
		},
	);

	it.each(['plugin', 'production'] as const)(
		'adopts an optional-chain prop fallback and follows its argument with the %s client',
		(mode) => {
			const body =
				mode === 'plugin'
					? PluginOptionalProp
					: loadCompiledFixtureSource(source, {
							id,
							mode: 'client',
							compileOptions: { hmr: false, dev: false },
						}).GuardedOptionalProp;
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.GuardedOptionalProp, {
				run: undefined,
				options: undefined,
			}).html;
			document.body.append(container);
			const paragraph = container.querySelector('p');
			const root = hydrateRoot(container, body, { run: undefined, options: undefined });
			try {
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph!.textContent).toBe('idle');
				const run = (label: string) => `ran:${label}`;
				const options = { label: 'first' };
				flushSync(() => root.render(body, { run, options }));
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph!.textContent).toBe('ran:first');
				options.label = 'second';
				flushSync(() => root.render(body, { run, options }));
				expect(paragraph!.textContent).toBe('ran:second');
				flushSync(() => root.render(body, { run: undefined, options }));
				expect(paragraph!.textContent).toBe('idle');
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

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
