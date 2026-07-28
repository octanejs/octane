import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';

import { flushSync, hydrateRoot } from '../src/index.js';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as tsrx from './_fixtures/scoped-jsx-values.tsrx';
import * as tsx from './_fixtures/scoped-jsx-values.tsx';

const fixtures = [
	{
		name: 'TSRX',
		client: tsrx,
		server: loadServerFixture<typeof tsrx>(
			'packages/octane/tests/_fixtures/scoped-jsx-values.tsrx',
		),
	},
	{
		name: 'TSX',
		client: tsx,
		server: loadServerFixture<typeof tsx>('packages/octane/tests/_fixtures/scoped-jsx-values.tsx'),
	},
];

function deferred() {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

for (const fixture of fixtures) {
	describe(`${fixture.name} scoped JSX values`, () => {
		for (const [exportName, selector] of [
			['DirectContext', '[data-context="direct"]'],
			['VariableContext', '[data-context="variable"]'],
			['PropContext', '[data-context="prop"]'],
			['NestedContext', '[data-context="nested"]'],
		] as const) {
			it(`${exportName} reads the nearest represented provider`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find(selector).textContent).toBe('inner');
				result.unmount();
			});

			it(`${exportName} server-renders the nearest represented provider`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('inner');
				expect(html).not.toContain('outer');
			});

			it(`${exportName} hydrates the existing provider and child`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const existing = container.querySelector(selector);
				expect(existing?.textContent).toBe('inner');

				const root = hydrateRoot(container, fixture.client[exportName]);
				flushSync(() => {});
				expect(container.querySelector(selector)).toBe(existing);
				expect(existing?.textContent).toBe('inner');
				root.unmount();
				container.remove();
			});
		}

		for (const exportName of ['BuiltInErrorValue', 'WrappedErrorValue'] as const) {
			it(`${exportName} assigns a synchronous error to the nearest boundary`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find('[data-fallback="inner"]').textContent).toBe('inner');
				expect(result.findAll('[data-fallback="outer"]')).toHaveLength(0);
				result.unmount();
			});

			it(`${exportName} server-renders the nearest error fallback`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('data-fallback="inner"');
				expect(html).not.toContain('data-fallback="outer"');
			});
		}

		for (const [exportName, resolved] of [
			['DirectSuspense', 'direct'],
			['VariableSuspense', 'variable'],
			['WrappedSuspenseValue', 'wrapped'],
		] as const) {
			it(`${exportName} suspends and resolves inside the represented boundary`, async () => {
				const pending = deferred();
				const result = mount(fixture.client[exportName], { promise: pending.promise });
				expect(result.find('[data-fallback="pending"]').textContent).toBe('pending');

				await act(() => {
					pending.resolve('resolved');
				});

				expect(result.find(`[data-resolved="${resolved}"]`).textContent).toBe('resolved');
				expect(result.findAll('[data-fallback="pending"]')).toHaveLength(0);
				result.unmount();
			});

			it(`${exportName} server-renders its own pending fallback`, () => {
				const pending = deferred();
				const { html } = ServerRuntime.renderToString(fixture.server[exportName], {
					promise: pending.promise,
				});
				expect(html).toContain('data-fallback="pending"');
				expect(html).toContain('pending');
			});
		}

		it('preserves ordinary element inspection and cloning', () => {
			const result = mount(fixture.client.OrdinaryElementValue);
			expect(result.find('[data-valid="true"] [data-ordinary="yes"]').textContent).toBe('ordinary');
			expect(result.find('[data-inspected="yes"]').textContent).toBe('ordinary');
			result.unmount();
		});

		it('preserves ordinary element inspection and cloning during server rendering', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.OrdinaryElementValue);
			expect(html).toContain('data-valid="true"');
			expect(html).toContain('data-ordinary="yes"');
			expect(html).toContain('data-inspected="yes"');
		});
	});
}

describe('TSRX directives nested in scoped JSX values', () => {
	it('retains the provider inside an active directive arm', () => {
		const result = mount(tsrx.DirectiveContext, { visible: true });
		expect(result.find('[data-context="directive"]').textContent).toBe('inner');
		result.update(tsrx.DirectiveContext, { visible: false });
		expect(result.find('[data-context="directive"]').textContent).toBe('hidden');
		result.unmount();
	});

	it('server-renders a nested directive under the represented provider', () => {
		const server = fixtures[0].server as typeof tsrx;
		const { html } = ServerRuntime.renderToString(server.DirectiveContext, { visible: true });
		expect(html).toContain('data-context="directive"');
		expect(html).toContain('inner');
		expect(html).not.toContain('outer');
	});
});
