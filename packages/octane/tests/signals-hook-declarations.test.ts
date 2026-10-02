import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { prerender } from 'octane/static';
import * as Signals from 'octane/signals';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';
import * as Fixture from './_fixtures/signals-hook-declarations.tsrx';

// Root-relative ids match the project's Vite transform of the same files.
const fixtureId = '/packages/octane/tests/_fixtures/signals-hook-declarations.tsrx';
const cellId = '/packages/octane/tests/_fixtures/signals-hook-declarations-cell.ts';
const pairId = '/packages/octane/tests/_fixtures/signals-hook-declarations-pair.ts';
const forwardId = '/packages/octane/tests/_fixtures/signals-hook-declarations-forward.tsrx';
const read = (id: string) => readFileSync(id.slice(1), 'utf8');
const sources = {
	fixture: read(fixtureId),
	cell: read(cellId),
	pair: read(pairId),
	forward: read(forwardId),
};

const MODES = [
	{ dev: true, hmr: false },
	{ dev: false, hmr: false },
	{ dev: false, hmr: false, strong: true },
] as const;

function load(mode: 'client' | 'server', compileOptions: { dev: boolean }) {
	const inlineHookMemo = mode === 'client' && !compileOptions.dev;
	const cell = loadPlainHookFixtureSource(sources.cell, {
		id: cellId,
		mode,
		inlineHookMemo,
		runtimeModules: { 'octane/signals': Signals },
	});
	const pair = loadPlainHookFixtureSource(sources.pair, {
		id: pairId,
		mode,
		inlineHookMemo,
		runtimeModules: { './signals-hook-declarations-cell': cell },
	});
	const forward = loadCompiledFixtureSource(sources.forward, {
		id: forwardId,
		mode,
		compileOptions,
		runtimeModules: { './signals-hook-declarations-cell': cell },
	});
	return loadCompiledFixtureSource<typeof Fixture>(sources.fixture, {
		id: fixtureId,
		mode,
		compileOptions,
		runtimeModules: {
			'octane/signals': Signals,
			'./signals-hook-declarations-pair': pair,
			'./signals-hook-declarations-forward.tsrx': forward,
		},
	});
}

describe('signal declarations inside custom hooks', () => {
	for (const compileOptions of MODES) {
		const label = JSON.stringify(compileOptions);
		const client = load('client', compileOptions);
		// Browser and server bundles evaluate different module sets, so their
		// runtime hook-slot numbers differ. Reproduce that before loading the
		// server modules: declaration identity must not depend on those numbers.
		load('server', compileOptions);
		const server = load('server', compileOptions);

		it(`gives each call of a query$ hook its own query in ${label}`, async () => {
			const loaded: string[] = [];
			const loader = async (key: string) => {
				loaded.push(key);
				return key.toUpperCase();
			};
			const rendered = mount(client.TwoQueries, { a: 'x', b: 'y', load: loader });
			try {
				await act(async () => {});
				expect(rendered.container.textContent).toBe('X|Y');
				expect(loaded).toEqual(['x', 'y']);
			} finally {
				rendered.unmount();
			}
		});

		it(`keeps signal$ and derived$ cells per hook call in ${label}`, () => {
			const props = { first: 'a', second: 'b', showFirst: true };
			const rendered = mount(client.Cells, props);
			try {
				const output = () => rendered.find('output').textContent;
				expect(output()).toBe('A,B,l,r,l2,r2');
				rendered.click('.right');
				expect(output()).toBe('A,B,l,r!,l2,r2');
				rendered.click('.first');
				expect(output()).toBe('A!,B,l,r!,l2,r2');
				// Skipping the first call neither retires its cells nor lets the
				// remaining calls take them over.
				rendered.update(client.Cells, { ...props, showFirst: false });
				expect(output()).toBe('-,B,l,r!,l2,r2');
				rendered.click('.second');
				expect(output()).toBe('-,B!,l,r!,l2,r2');
				rendered.update(client.Cells, { ...props, showFirst: true });
				expect(output()).toBe('A!,B!,l,r!,l2,r2');
			} finally {
				rendered.unmount();
			}
		});

		// Composing modules that do not import signals still key each `$` hook call.
		for (const via of ['plain', 'renamed', 'forwarded', 'aliased'] as const) {
			const composer = {
				plain: 'a plain module',
				renamed: 'a plain module through an alias with $',
				forwarded: 'a .tsrx module',
				aliased: 'a .tsrx module through an alias without $',
			}[via];
			it(`keeps cells per call of hooks composed in ${composer} in ${label}`, () => {
				const rendered = mount(client.StoredPairs, { via });
				try {
					expect(rendered.find('output').textContent).toBe('a,b,c,d');
					rendered.click('button');
					expect(rendered.find('output').textContent).toBe('a,b!,c,d');
				} finally {
					rendered.unmount();
				}
			});

			it(`adopts cells of hooks composed in ${composer} in ${label}`, () => {
				const container = document.createElement('div');
				document.body.append(container);
				let root: ReturnType<typeof hydrateRoot> | undefined;
				try {
					container.innerHTML = renderToString(server.StoredPairs, { via }).html;
					const output = container.querySelector('output')!;
					expect(output.textContent).toBe('a,b,c,d');
					flushSync(() => {
						root = hydrateRoot(container, client.StoredPairs, { via });
					});
					expect(container.querySelector('output')).toBe(output);
					flushSync(() => container.querySelector('button')!.click());
					expect(output.textContent).toBe('a,b!,c,d');
				} finally {
					root?.unmount();
					container.remove();
				}
			});
		}

		it(`adopts server hook-call cells by matching identity in ${label}`, () => {
			const container = document.createElement('div');
			document.body.append(container);
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				container.innerHTML = renderToString(server.Cells, {
					first: 'a',
					second: 'b',
					showFirst: true,
				}).html;
				const output = container.querySelector('output')!;
				const button = container.querySelector('.left2')!;
				expect(output.textContent).toBe('A,B,l,r,l2,r2');
				// Hydration presents each cell's server value, then its live value.
				let adopted = '';
				flushSync(() => {
					root = hydrateRoot(container, client.Cells, { first: 'p', second: 'q', showFirst: true });
					adopted = output.textContent!;
				});
				expect(adopted).toBe('A,B,l,r,l2,r2');
				expect(container.querySelector('output')).toBe(output);
				expect(container.querySelector('.left2')).toBe(button);
				expect(output.textContent).toBe('P,Q,l,r,l2,r2');
				flushSync(() => (button as HTMLButtonElement).click());
				expect(output.textContent).toBe('P,Q,l,r,l2!,r2');
				expect(errors).not.toHaveBeenCalled();
			} finally {
				errors.mockRestore();
				root?.unmount();
				container.remove();
			}
		});

		// The project's own transform (HMR in the dev project) must agree with
		// every server compile on declaration identity.
		it(`adopts server cells into the project-compiled client from ${label}`, () => {
			const container = document.createElement('div');
			document.body.append(container);
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				container.innerHTML = renderToString(server.Cells, {
					first: 'a',
					second: 'b',
					showFirst: true,
				}).html;
				const output = container.querySelector('output')!;
				let adopted = '';
				flushSync(() => {
					root = hydrateRoot(container, Fixture.Cells, {
						first: 'p',
						second: 'q',
						showFirst: true,
					});
					adopted = output.textContent!;
				});
				expect(adopted).toBe('A,B,l,r,l2,r2');
				expect(container.querySelector('output')).toBe(output);
				expect(output.textContent).toBe('P,Q,l,r,l2,r2');
				flushSync(() => container.querySelector<HTMLButtonElement>('.right')!.click());
				expect(output.textContent).toBe('P,Q,l,r!,l2,r2');
				expect(errors).not.toHaveBeenCalled();
			} finally {
				errors.mockRestore();
				root?.unmount();
				container.remove();
			}
		});

		it(`adopts each server query of a repeated hook in ${label}`, async () => {
			const container = document.createElement('div');
			document.body.append(container);
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			let release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			try {
				const output = await prerender(server.TwoStrictQueries, {
					a: 'x',
					b: 'y',
					load: async (key: string) => key.toUpperCase(),
				});
				container.innerHTML = output.html;
				const paragraph = container.querySelector('p')!;
				expect(paragraph.textContent).toBe('X|Y');
				const started: string[] = [];
				root = hydrateRoot(container, client.TwoStrictQueries, {
					a: 'x',
					b: 'y',
					load: async (key: string) => {
						started.push(key);
						await gate;
						return key + '!';
					},
				});
				expect(started).toEqual(['x', 'y']);
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph.textContent).toBe('X|Y');
				await act(async () => release());
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph.textContent).toBe('x!|y!');
				expect(errors).not.toHaveBeenCalled();
			} finally {
				release();
				errors.mockRestore();
				root?.unmount();
				container.remove();
			}
		});
	}
});
