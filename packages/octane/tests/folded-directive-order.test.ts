import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import * as ServerRuntime from 'octane/server';
import { act, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	ForAfterComponent,
	IfAfterComponent,
	SwitchAfterComponent,
} from './_fixtures/folded-directive-order.tsrx';

// A directive folded into a returned fragment keeps its source position after
// a sibling component in children passed to another component (#3094).

const server = loadServerFixture(
	join(import.meta.dirname, '_fixtures/folded-directive-order.tsrx'),
	{
		id: 'folded-directive-order.tsrx',
		compileOptions: { dev: process.env['OCTANE_TEST_COMPILE_MODE'] !== 'prod' },
	},
);

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

const outer = (root: ParentNode) =>
	root.querySelector('#outer')!.innerHTML.replace(/<!--.*?-->/g, '');

const cases = [
	[
		'@for',
		'ForAfterComponent',
		ForAfterComponent,
		'<ul><li>a</li><li>b</li></ul><p>a</p><p>b</p>',
		'<ul><li>c</li></ul><p>c</p>',
	],
	[
		'@if',
		'IfAfterComponent',
		IfAfterComponent,
		'<ul><li>a</li><li>b</li></ul><p>2</p>',
		'<ul><li>c</li></ul><p>1</p>',
	],
	[
		'@switch',
		'SwitchAfterComponent',
		SwitchAfterComponent,
		'<ul><li>a</li><li>b</li></ul><p>some</p>',
		'<ul><li>c</li></ul><p>some</p>',
	],
] as const;

describe('a folded directive after a sibling component', () => {
	it.each(cases)(
		'renders %s in source order on mount and update',
		(_, __, component, first, next) => {
			const r = mount(component as any, { rows: ['a', 'b'] });
			expect(outer(r.container)).toBe(first);
			r.update(component as any, { rows: ['c'] });
			expect(outer(r.container)).toBe(next);
			r.update(component as any, { rows: [] });
			expect(outer(r.container)).toBe(
				component === SwitchAfterComponent ? '<ul></ul><p>none</p>' : '<ul></ul>',
			);
			r.update(component as any, { rows: ['a', 'b'] });
			expect(outer(r.container)).toBe(first);
			r.unmount();
		},
	);

	it.each(cases)('hydrates %s server output in source order', async (_, name, component, first) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		containers.push(container);
		container.innerHTML = ServerRuntime.renderToString(server[name], { rows: ['a', 'b'] }).html;
		expect(outer(container)).toBe(first);
		const serverHtml = container.innerHTML;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		const root = hydrateRoot(container, component as any, { rows: ['a', 'b'] } as any, {
			onRecoverableError: (error) => recoverable.push(error),
		});
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(errors.mock.calls).toEqual([]);
		expect(container.innerHTML).toBe(serverHtml);
		root.unmount();
	});
});
