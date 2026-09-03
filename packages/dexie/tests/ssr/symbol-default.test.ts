import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import {
	FactorySymbolDefault,
	LiveQuerySymbolDefault,
	ObservableSymbolDefault,
} from '../_fixtures/symbol-default.tsrx';

describe('Dexie server Symbol default results', () => {
	it.each([
		['observable', ObservableSymbolDefault],
		['observable factory', FactorySymbolDefault],
	] as const)('renders the %s default without subscribing', (_, Reader) => {
		const observable = {
			subscribe() {
				throw new Error('server must not subscribe');
			},
		};
		const { html } = renderToString(Reader, { observable, defaultResult: Symbol('loading') });
		expect(html).toContain('<output>Symbol(loading)</output>');
	});

	it('renders the live query default without executing its querier', () => {
		const { html } = renderToString(LiveQuerySymbolDefault, {
			querier() {
				throw new Error('server must not query');
			},
			defaultResult: Symbol('loading'),
		});
		expect(html).toContain('<output>Symbol(loading)</output>');
	});
});
