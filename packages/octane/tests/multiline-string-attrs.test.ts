import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { prerender } from 'octane/static';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/multiline-string-attr.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/multiline-string-attr.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const MULTILINE_VALUE = 'one\n\t\t\t\ttwo';
const MULTILINE_LABEL = 'accessible\n\t\t\t\tchip';
const WARM_DATA_TESTID = 'warmed-multiline-prop-chip';
const WARM_MULTILINE_VALUE = 'one\n\t\t\t\t\ttwo';
const WARM_MULTILINE_LABEL = 'accessible\n\t\t\t\t\tchip';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((fulfill) => {
		resolve = fulfill;
	});
	return { promise, resolve };
}

// JSX string ATTRIBUTES may legally span lines (multi-line class strings are
// common in Tailwind-heavy React code — tanstack.com's homepage has several).
// The raw JSX slice of such a literal is NOT a valid JS string literal; three
// emission paths sliced raw source and produced unparseable output: the
// hostValue/spread binding path (printExpr), the createElement de-opt path,
// and the SSR warm-child plan. Found porting tanstack.com (Phase 2c).
describe('multi-line JSX string attributes', () => {
	it('the multi-line value round-trips to the DOM intact', () => {
		const mounted = mount(client.SpreadHost as any, { rest: { 'data-x': '1' } });
		try {
			expect(mounted.find('div').getAttribute('class')).toBe('one\n\t\ttwo');
		} finally {
			mounted.unmount();
		}
	});

	it('component props carry the multi-line string intact', () => {
		const mounted = mount(client.PropChip as any, {});
		try {
			const chip = mounted.find('[data-testid="multiline-prop-chip"]');
			expect(chip.getAttribute('aria-label')).toBe(MULTILINE_LABEL);
			expect(chip.getAttribute('data-title')).toBe(MULTILINE_VALUE);
			expect(chip.textContent).toBe(MULTILINE_VALUE);
		} finally {
			mounted.unmount();
		}
	});

	it('server-renders and hydrates a spread-host value without replacing the node', () => {
		const props = { rest: { 'data-x': 'server-and-client' } };
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.SpreadHost, props).html;
		const serverNode = container.querySelector('div')!;
		expect(serverNode.getAttribute('class')).toBe('one\n\t\ttwo');
		expect(serverNode.getAttribute('data-x')).toBe('server-and-client');

		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.SpreadHost, props);
		try {
			flushSync(() => {});
			const hydratedNode = container.querySelector('div')!;
			expect(hydratedNode).toBe(serverNode);
			expect(hydratedNode.getAttribute('class')).toBe('one\n\t\ttwo');
			expect(hydratedNode.getAttribute('data-x')).toBe('server-and-client');
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	it('server-renders and hydrates warm-child props exactly without replacing the node', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.PropChip).html;
		const serverNode = container.querySelector('[data-testid="multiline-prop-chip"]')!;
		expect(serverNode.getAttribute('aria-label')).toBe(MULTILINE_LABEL);
		expect(serverNode.getAttribute('data-testid')).toBe('multiline-prop-chip');
		expect(serverNode.getAttribute('data-title')).toBe(MULTILINE_VALUE);
		expect(serverNode.textContent).toBe(MULTILINE_VALUE);

		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.PropChip);
		try {
			flushSync(() => {});
			const hydratedNode = container.querySelector('[data-testid="multiline-prop-chip"]')!;
			expect(hydratedNode).toBe(serverNode);
			expect(hydratedNode.getAttribute('aria-label')).toBe(MULTILINE_LABEL);
			expect(hydratedNode.getAttribute('data-testid')).toBe('multiline-prop-chip');
			expect(hydratedNode.getAttribute('data-title')).toBe(MULTILINE_VALUE);
			expect(hydratedNode.textContent).toBe(MULTILINE_VALUE);
			expect(diagnostic).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			diagnostic.mockRestore();
			container.remove();
		}
	});

	it('passes exact multi-line props into a warmed child fetch before it resolves', async () => {
		const pending = deferred<string>();
		const inputs: string[][] = [];
		const done = prerender(server.WarmPropPage, {
			load(...input) {
				inputs.push(input);
				return pending.promise;
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(inputs).toEqual([[WARM_MULTILINE_LABEL, WARM_DATA_TESTID, WARM_MULTILINE_VALUE]]);

		pending.resolve('warmed');
		const { html } = await done;
		const container = document.createElement('div');
		container.innerHTML = html;
		const chip = container.querySelector('[data-warm-result="warmed"]')!;
		expect(chip.textContent).toBe(WARM_MULTILINE_VALUE);
		expect(inputs).toHaveLength(1);
	});

	it('keeps an optional static computed dependency null-safe', async () => {
		const inputs: string[] = [];
		const { html } = await prerender(server.OptionalComputedPropPage, {
			metadata: null,
			load(label) {
				inputs.push(label);
				return Promise.resolve(label.toUpperCase());
			},
		});
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(container.querySelector('[data-optional-computed-result]')?.textContent).toBe(
			'FALLBACK',
		);
		expect(inputs).toEqual(['fallback']);
	});
});
