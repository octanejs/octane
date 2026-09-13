import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { act, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/host-attribute-updates.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/host-attribute-updates.tsrx',
);
afterEach(() => vi.unstubAllEnvs());

describe.each(['test', 'production'])('host values with %s runtime semantics', (environment) => {
	it('uses one URL coercion for validation and writing', () => {
		vi.stubEnv('NODE_ENV', environment);
		let available = true;
		const url = {
			toString() {
				if (!available) throw new Error('URL coerced twice');
				available = false;
				return '#coerced';
			},
		};
		const r = mount(client.ScalarValue, { title: 'title', url });
		try {
			expect(r.find('#scalar').getAttribute('href')).toBe('#coerced');
		} finally {
			r.unmount();
		}
	});

	it('restores exact live attributes and metadata when a later sibling suspends', async () => {
		vi.stubEnv('NODE_ENV', environment);
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = done;
		});
		let waiting = false;
		const read = () => {
			if (waiting) throw pending;
			return 'ready';
		};
		const r = mount(client.PendingValues, { label: 'initial', url: '#initial', read });
		const link = r.find('#pending-link');
		const title = document.head.querySelector('title')!;
		const meta = document.head.querySelector('meta[name="pending-description"]')!;
		try {
			link.setAttribute('title', 'foreign');
			link.removeAttribute('href');
			title.textContent = 'foreign head';
			meta.setAttribute('content', 'foreign metadata');
			const textNode = title.firstChild;
			waiting = true;
			r.update(client.PendingValues, { label: 'next', url: '#next', read });
			expect(link.getAttribute('title')).toBe('foreign');
			expect(link.hasAttribute('href')).toBe(false);
			expect(meta.getAttribute('content')).toBe('foreign metadata');
			expect(title.textContent).toBe('foreign head');
			expect(title.firstChild).toBe(textNode);
			waiting = false;
			await act(() => resolve());
			expect(r.find('#pending-link')).toBe(link);
			expect(link.getAttribute('href')).toBe('#next');
			expect(meta.getAttribute('content')).toBe('next');
			expect(title.textContent).toBe('next');
		} finally {
			r.unmount();
		}
	});

	it('preserves coercion, aliases, URL filtering, and special host properties across updates', () => {
		vi.stubEnv('NODE_ENV', environment);
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(client.Values, { value: 2, url: '#initial' });
		try {
			const anchor = r.find('#anchor');
			const circle = r.find('#circle');
			expect(anchor.getAttribute('title')).toBe('2');
			expect(circle.getAttribute('stroke-width')).toBe('2');
			expect(r.find('#svg').getAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns')).toBe('2');
			r.update(client.Values, { value: false, url: '' });
			expect(anchor.hasAttribute('title')).toBe(false);
			expect(anchor.getAttribute('data-n')).toBe('false');
			expect(anchor.getAttribute('href')).toBe('');
			expect(r.find('#image').hasAttribute('src')).toBe(false);
			expect(r.find('#enumerated').getAttribute('spellcheck')).toBe('false');
			expect(anchor.hasAttribute('download')).toBe(false);
			r.update(client.Values, { value: true, url: 'j\navascript:alert(1)' });
			expect(anchor.hasAttribute('title')).toBe(false);
			expect(anchor.getAttribute('data-n')).toBe('true');
			expect(anchor.getAttribute('download')).toBe('');
			expect(anchor.getAttribute('href')).toContain('React has blocked a javascript: URL');
			expect(r.find('#use').getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toContain(
				'React has blocked',
			);
			expect(r.find('#custom').getAttribute('title')).toBe('');
			expect(r.find('#custom').getAttribute('href')).toBe('j\navascript:alert(1)');
			for (const value of [null, undefined, Symbol('remove'), () => 'remove']) {
				r.update(client.Values, { value, url: '#next' });
				expect(anchor.hasAttribute('title')).toBe(false);
				expect(anchor.hasAttribute('data-n')).toBe(false);
				expect(circle.hasAttribute('cx')).toBe(false);
			}
			r.update(client.Values, { value: 7, url: '#restored' });
			expect(r.find('#anchor')).toBe(anchor);
			expect(r.find('#circle')).toBe(circle);
			expect(circle.getAttribute('cx')).toBe('7');
			expect((r.find('#control') as HTMLInputElement).value).toBe('7');
		} finally {
			r.unmount();
			warning.mockRestore();
		}
	});

	it('adopts server attributes and preserves their nodes on the next update', () => {
		vi.stubEnv('NODE_ENV', environment);
		const props = { value: 2, url: '#same' };
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server.Values, props).html;
		const anchor = container.querySelector('#anchor');
		const circle = container.querySelector('#circle');
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.Values, props);
		try {
			flushSync(() => {});
			expect(container.querySelector('#anchor')).toBe(anchor);
			expect(container.querySelector('#circle')).toBe(circle);
			expect(diagnostic).not.toHaveBeenCalled();
			flushSync(() => root.render(client.Values, { value: 3, url: '#next' }));
			expect(anchor!.getAttribute('title')).toBe('3');
			expect(circle!.getAttribute('stroke-width')).toBe('3');
		} finally {
			root.unmount();
			container.remove();
			diagnostic.mockRestore();
		}
	});
});

it('recoerces metadata objects, removes omitted attrs, and repairs external head edits', () => {
	let content = 'first';
	const value = { toString: () => content };
	const props = { lang: 'en', text: 'first title', attrs: { media: 'screen' }, content: value };
	const r = mount(client.Metadata, props);
	const meta = document.head.querySelector('meta[name="description"]')!;
	const title = document.head.querySelector('title')!;
	try {
		expect(meta.getAttribute('content')).toBe('first');
		content = 'second';
		r.update(client.Metadata, { ...props, attrs: {} });
		expect(meta.getAttribute('content')).toBe('second');
		expect(meta.hasAttribute('media')).toBe(false);
		meta.setAttribute('content', 'foreign');
		title.textContent = 'foreign title';
		r.update(client.Metadata, { ...props, attrs: {} });
		expect(meta.getAttribute('content')).toBe('second');
		expect(title.textContent).toBe('first title');
		r.update(client.Metadata, { ...props, text: '', lang: null, content: null });
		expect(title.textContent).toBe('');
		expect(title.hasAttribute('lang')).toBe(false);
		expect(meta.hasAttribute('content')).toBe(false);
	} finally {
		r.unmount();
	}
	expect(meta.isConnected).toBe(false);
	expect(title.isConnected).toBe(false);
});
