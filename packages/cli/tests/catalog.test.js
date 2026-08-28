import { afterEach, describe, expect, it } from 'vitest';
import { parseErrorReference } from '../src/commands/explain.js';
import { BINDINGS, resolveBinding } from '../src/data/index.js';
import { createFixture, runCli } from './helpers/fixture.js';

/** @type {{ cleanup: () => void }[]} */
const fixtures = [];

function fixture() {
	const created = createFixture({ 'package.json': { name: 'app' }, 'pnpm-lock.yaml': '' });
	fixtures.push(created);
	return created;
}

afterEach(() => {
	while (fixtures.length > 0) fixtures.pop()?.cleanup();
});

const noExec = { which: () => null, run: async () => ({ code: 0, stdout: '', stderr: '' }) };

describe('the shipped catalog', () => {
	it('resolves a binding by its own name and by the React package it ports', () => {
		expect(resolveBinding('@octanejs/zustand')).toMatchObject({ via: 'binding' });
		expect(resolveBinding('zustand')?.binding.name).toBe('@octanejs/zustand');
		expect(resolveBinding('@tanstack/react-query')?.binding.name).toBe('@octanejs/tanstack-query');
		expect(resolveBinding('react-textarea-autosize')?.binding.name).toBe(
			'@octanejs/textarea-autosize',
		);
		expect(resolveBinding('react-syntax-highlighter')?.binding.name).toBe(
			'@octanejs/syntax-highlighter',
		);
		expect(resolveBinding('react-select')?.binding.name).toBe('@octanejs/select');
	});

	it('gives every binding a category and an upstream or an explicit absence', () => {
		expect(BINDINGS.length).toBeGreaterThan(0);
		for (const binding of BINDINGS) {
			expect(binding.category, binding.name).not.toBe('Uncategorized');
			expect(binding.surface, binding.name).not.toBe('');
		}
	});
});

describe('octane bindings', () => {
	it('lists every binding when unfiltered', async () => {
		const result = await runCli(['bindings', '--json'], { exec: noExec });
		expect(result.json().bindings).toHaveLength(BINDINGS.length);
	});

	it('filters by upstream package name', async () => {
		const result = await runCli(['bindings', 'zustand', '--json'], { exec: noExec });
		expect(result.json().bindings.map((/** @type {any} */ b) => b.name)).toContain(
			'@octanejs/zustand',
		);
	});

	it('reports an empty result rather than failing', async () => {
		const result = await runCli(['bindings', 'definitely-not-a-binding', '--json'], {
			exec: noExec,
		});
		expect(result.json().bindings).toEqual([]);
		expect(result.exitCode).toBe(0);
	});
});

describe('octane explain', () => {
	it('finds the code in a bare number, a URL, or a pasted production message', () => {
		expect(parseErrorReference('3')).toMatchObject({ code: '3', args: [] });
		expect(parseErrorReference('#3')).toMatchObject({ code: '3' });
		expect(parseErrorReference('https://octanejs.dev/errors/12')).toMatchObject({ code: '12' });
		expect(parseErrorReference('no code here')).toBe(null);
	});

	it('rebuilds the full message from a minified production error', async () => {
		// A production build hides the message and its arguments behind a URL;
		// recovering both is the point of the command.
		const pasted =
			'Minified Octane error #3; visit https://octanejs.dev/errors/3?args[]=%7Bfoo%3A%201%7D ' +
			'for the full message or use a development build';

		const report = (await runCli(['explain', pasted, '--json'], { exec: noExec })).json();

		expect(report.code).toBe(3);
		expect(report.args).toEqual(['{foo: 1}']);
		expect(report.message).toContain('{foo: 1}');
		expect(report.message).not.toContain('%s');
		expect(report.url).toBe('https://octanejs.dev/errors/3');
	});

	it('fails clearly on an unknown code', async () => {
		const result = await runCli(['explain', '4242'], { exec: noExec });
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch(/Unknown Octane error code 4242/);
	});
});

describe('octane add', () => {
	it('maps a React package to its binding and reports the divergences', async () => {
		const { root } = fixture();
		const report = (
			await runCli(['add', 'react-hook-form', '--cwd', root, '--no-install', '--json'], {
				exec: noExec,
			})
		).json();

		expect(report.ok).toBe(true);
		expect(report.resolved[0]).toMatchObject({
			requested: 'react-hook-form',
			binding: '@octanejs/hook-form',
			via: 'react-package',
		});
		expect(report.resolved[0].divergences.length).toBeGreaterThan(0);
	});

	it('says so when nothing ports the package, and suggests near names', async () => {
		const { root } = fixture();
		const result = await runCli(
			['add', 'react-resizable', '--cwd', root, '--no-install', '--json'],
			{ exec: noExec },
		);

		expect(result.exitCode).toBe(1);
		expect(result.json().unavailable[0]).toMatchObject({
			requested: 'react-resizable',
			suggestions: expect.arrayContaining(['@octanejs/resizable-panels']),
		});
	});

	it('installs through the project package manager', async () => {
		const { root } = fixture();
		/** @type {{ file: string, args: string[] }[]} */
		const calls = [];
		const exec = {
			which: () => null,
			run: async (/** @type {string} */ file, /** @type {string[]} */ args) => {
				calls.push({ file, args });
				return { code: 0, stdout: '', stderr: '' };
			},
		};

		await runCli(['add', 'zustand', '--cwd', root, '--json'], { exec });

		expect(calls).toEqual([{ file: 'pnpm', args: ['add', '@octanejs/zustand'] }]);
	});

	it('does not reinstall a binding the project already declares', async () => {
		const { root, write } = fixture();
		write('package.json', { name: 'app', dependencies: { '@octanejs/zustand': '^0.1.16' } });

		const result = await runCli(['add', 'zustand', '--cwd', root, '--json'], { exec: noExec });
		expect(result.json().installed).toEqual([]);
	});
});
