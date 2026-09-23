// `<Ctx.Provider>` was removed in favor of rendering the context itself. The
// compiler rejects it only when `createContext` is in the same module, so an
// imported context (the common layout) reaches the runtime. There, the dev
// `.Provider` getter must throw the migration error instead of the opaque
// "element type is invalid" (client) or "comp is not a function" (server).
import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import * as Server from 'octane/server';
import { createContext } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import * as Tsrx from './_fixtures/legacy-provider-imported.tsrx';
import * as Tsx from './_fixtures/legacy-provider-imported-tsx';

const PROVIDER_ERROR = /\[OCTANE_CONTEXT_PROVIDER\] Context\.Provider was removed.*<Context value=/;

const clientFixtures = { tsrx: Tsrx, tsx: Tsx } as Record<string, Record<string, any>>;

describe('Context.Provider on an imported context', () => {
	for (const [dialect, fixture] of Object.entries(clientFixtures)) {
		it(`client (${dialect}): rendering <Ctx.Provider> throws the migration error`, () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				expect(() => mount(fixture.LegacyProvider)).toThrow(PROVIDER_ERROR);
			} finally {
				errSpy.mockRestore();
			}
		});

		it(`client (${dialect}): <Ctx value> still provides the value`, () => {
			const r = mount(fixture.CurrentProvider);
			expect(r.find('.theme').textContent).toBe('dark');
			r.unmount();
		});
	}

	for (const file of ['legacy-provider-imported.tsrx', 'legacy-provider-imported-tsx.tsx']) {
		const server = loadServerFixture(resolve(__dirname, '_fixtures', file), {
			runtimeModules: {
				'./legacy-provider-context': { Theme: Server.createContext('light') },
			},
		});

		it(`server (${file}): rendering <Ctx.Provider> throws the migration error`, () => {
			expect(() => Server.renderToString(server.LegacyProvider)).toThrow(PROVIDER_ERROR);
		});

		it(`server (${file}): <Ctx value> still provides the value`, () => {
			expect(Server.renderToString(server.CurrentProvider).html).toContain('dark');
		});
	}

	it('the error carries the diagnostic code on both runtimes', () => {
		for (const make of [createContext, Server.createContext]) {
			const Ctx = make(0) as any;
			let caught: any;
			try {
				Ctx.Provider;
			} catch (error) {
				caught = error;
			}
			expect(caught?.code).toBe('OCTANE_CONTEXT_PROVIDER');
			// Non-enumerable: spreads, Object.keys, and prop snapshots never trip it.
			expect(Object.keys(Ctx)).not.toContain('Provider');
			expect({ ...Ctx }).not.toHaveProperty('Provider');
		}
	});
});
