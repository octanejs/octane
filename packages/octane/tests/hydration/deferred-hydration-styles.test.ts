import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import { bootstrapIndependentHydration } from '../../src/hydration/independent-island.js';
import { renderToString } from 'octane/server';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';

const SOURCE = readFileSync(
	'packages/octane/tests/hydration/_fixtures/deferred-hydration-independent-styles.tsrx',
	'utf8',
);

describe('scoped styles in split hydration children', () => {
	it.each([false, true].flatMap((dev) => [false, true].map((frozen) => ({ dev, frozen }))))(
		'applies its scoped CSS while adopting server DOM (%j)',
		async ({ dev, frozen }) => {
			const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
			process.env.OCTANE_COMPILE_FROZEN_AST = frozen ? '1' : '0';
			const file = `/src/IndependentStyles-${dev}-${frozen}.tsrx`;
			const choose = vi.fn();
			const ready = vi.fn();
			let server;
			let widget;
			try {
				server = evaluateCompiledFixtureCode(
					compile(SOURCE, file, { mode: 'server', dev, hmr: false }).code,
					file,
					'server',
					{ './deferred-hydration-style-actions.js': { choose() {}, ready() {} } },
				);
				widget = evaluateCompiledFixtureCode(
					compile(SOURCE, file + '?octane-hydrate=0', { dev, hmr: false }).code,
					file,
					'client',
					{ './deferred-hydration-style-actions.js': { choose, ready } },
				);
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
				else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
			}
			const host = document.createElement('div');
			host.innerHTML = renderToString(server.StyledIndependentHydration, undefined, {
				independentHydration: {
					buildId: 'scoped-style-test',
					resolve: (boundaryId) => ({ moduleId: boundaryId, styles: [] }),
				},
			}).html;
			document.body.append(host);
			const input = host.querySelector('input')!;
			const button = host.querySelector('button')!;
			input.value = 'edited before activation';
			const className = button.className;
			const errors: unknown[] = [];
			const cleanup = bootstrapIndependentHydration(host, {
				buildId: 'scoped-style-test',
				loadStyles() {},
				async loadModule() {
					return widget;
				},
				onError: (error) => errors.push(error),
			});
			try {
				await vi.waitFor(() => expect(ready).toHaveBeenCalledWith(button));
				button.click();
				expect(choose).toHaveBeenCalledOnce();
				expect(getComputedStyle(button).color).toBe('rgb(20, 120, 80)');
				expect(getComputedStyle(button.querySelector('span')!).fontWeight).toBe('700');
				expect(getComputedStyle(host.querySelector('[data-outside]')!).color).not.toBe(
					'rgb(20, 120, 80)',
				);
				expect(host.querySelector('button')).toBe(button);
				expect(host.querySelector('input')).toBe(input);
				expect(input.value).toBe('edited before activation');
				expect(button.className).toBe(className);
				expect(errors).toEqual([]);
			} finally {
				cleanup();
				host.remove();
			}
		},
	);
});
