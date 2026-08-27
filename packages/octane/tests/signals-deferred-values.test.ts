import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { flushSync, isValidElement } from 'octane';
import { createScope } from 'octane/signals';
import { prerender } from 'octane/static';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/signals-deferred-values.tsrx';

const server = loadServerFixture<typeof client>(
	resolve(__dirname, '_fixtures/signals-deferred-values.tsrx'),
	{ compileOptions: { nativeReads: true } },
);

describe('native reads in deferred JSX values', () => {
	it('refreshes a shared descriptor after external inspection and unchanged parent props', () => {
		const scope = createScope({ scopeKey: 'native-deferred-client' });
		const count$ = scope.signal$('count', 1);
		const view = client.createDeferredView$(count$);
		expect(isValidElement(view)).toBe(true);
		expect((view as { props: { title: string } }).props.title).toBe('1');
		count$.set(2);
		const rendered = mount(client.DeferredHost, { view, label: 'before' });
		try {
			const host = rendered.find('.deferred-value');
			expect(host.textContent).toBe('2');
			expect(host.getAttribute('title')).toBe('2');
			rendered.update(client.DeferredHost, { view, label: 'after' });
			flushSync(() => count$.set(3));
			expect(rendered.find('.label').textContent).toBe('after');
			expect(rendered.find('.deferred-value')).toBe(host);
			expect(host.textContent).toBe('3');
			expect(host.getAttribute('title')).toBe('3');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('tracks setup reads in an arrow component that returns JSX', () => {
		const scope = createScope({ scopeKey: 'native-arrow-client' });
		const count$ = scope.signal$('count', 1);
		const rendered = mount(client.ArrowReader, { count$ });
		try {
			flushSync(() => count$.set(5));
			expect(rendered.find('.arrow-value').textContent).toBe('5');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('serializes reads made by a deferred server descriptor', async () => {
		const scope = createScope({ scopeKey: 'native-deferred-server' });
		const count$ = scope.signal$('count', 6);
		try {
			const view = server.createDeferredView$(count$);
			const output = await prerender(server.DeferredHost, { view, label: 'server' });
			expect(output.html).toContain('title="6"');
			expect(output.html).toContain('>6</p>');
			expect(output.signals?.scopes).toEqual([scope.serialize()]);
		} finally {
			scope.dispose();
		}
	});
});
