import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { Cells, GuardedCell, ReadingApp } from './_fixtures/hook-alias.tsrx';
import { StrongReadingApp } from './_fixtures/hook-alias-strong.tsrx';

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

// An imported custom hook keeps its hook identity under any local name, as it
// does in React: `import { useReading as readValue }` is still that hook.
describe('imported custom hooks under an ordinary local alias', () => {
	it.each([
		['Compat', ReadingApp],
		['Strong', StrongReadingApp],
	] as const)('reads the nearest context on every render in %s', (_mode, App) => {
		const r = mount(App, { value: 'first' });
		try {
			const output = r.find('output');
			expect(output.textContent).toBe('first');
			r.update(App, { value: 'next' });
			expect(r.find('output')).toBe(output);
			expect(output.textContent).toBe('next');
		} finally {
			r.unmount();
		}
	});

	it('gives each aliased call its own state', () => {
		const r = mount(Cells);
		try {
			expect(r.find('output').textContent).toBe('1:10');
			r.click('.a');
			expect(r.find('output').textContent).toBe('2:10');
			r.click('.b');
			expect(r.find('output').textContent).toBe('2:11');
		} finally {
			r.unmount();
		}
	});

	it("keeps an aliased call's state across an early null return", () => {
		const r = mount(GuardedCell, { shown: true });
		try {
			r.click('.guarded');
			expect(r.find('.guarded').textContent).toBe('2');
			r.update(GuardedCell, { shown: false });
			expect(r.container.querySelector('.guarded')).toBeNull();
			r.update(GuardedCell, { shown: true });
			expect(r.find('.guarded').textContent).toBe('2');
		} finally {
			r.unmount();
		}
	});

	it('hydrates each aliased call with its own server state', async () => {
		type Module = ReturnType<typeof loadCompiledFixtureSource>;
		const load = (name: string, runtimeModules: Record<string, Module> = {}): Module =>
			loadCompiledFixtureSource(readFileSync(join(FIXTURES, name), 'utf8'), {
				id: name,
				mode: 'server',
				compileOptions: { mode: 'server' },
				runtimeModules,
			});
		const server = load('hook-alias.tsrx', {
			'./hook-alias-source.tsrx': load('hook-alias-source.tsrx'),
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = (await ServerRT.renderToString(server['Cells'], {})).html;
		const output = container.querySelector('output')!;
		expect(output.textContent).toBe('1:10');
		const root = hydrateRoot(container, Cells, {});
		try {
			flushSync(() => {});
			expect(container.querySelector('output')).toBe(output);
			flushSync(() => container.querySelector<HTMLButtonElement>('.b')!.click());
			expect(output.textContent).toBe('1:11');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
