// React 19 hoists <title>/<meta>/<link> (and Float resources) from anywhere in
// the tree. The client compiler has always partitioned nested metadata out of
// host elements; the server previously rejected the nesting with a compile
// error, leaving the contract asymmetric. Both sides now serialize/hoist the
// same partition: metadata renders into the head channel, the host body keeps
// only its real children, and hydration adopts without mismatch warnings.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, hydrateRoot, flushSync, resetFloatResourceState } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { NestedHead, DeepNestedHead } from './_fixtures/nested-head.tsrx';

const srv = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/nested-head.tsrx',
) as Record<string, any>;

describe('nested-under-host document metadata', () => {
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		document.head
			.querySelectorAll('[data-precedence], [data-oct-res], [data-oct-hint]')
			.forEach((el) => el.remove());
		resetFloatResourceState();
		errSpy.mockRestore();
	});

	it('server-renders nested metadata into the head channel, not the host body', async () => {
		const r = await ServerRT.renderToString(srv.NestedHead, { title: 'Nested Title' });
		// Metadata and the resource landed in the (folded) head output…
		expect(r.html).toContain('<title');
		expect(r.html).toContain('Nested Title');
		expect(r.html).toContain('name="desc"');
		expect(r.html).toContain('data-precedence="default"');
		// …and the host body carries only its real child.
		const bodyStart = r.html.indexOf('<section');
		const body = r.html.slice(bodyStart);
		expect(body).toContain('class="inner"');
		expect(body).not.toContain('<title');
		expect(body).not.toContain('<meta');
		expect(body).not.toContain('rel="stylesheet"');
	});

	it('hoists metadata nested two hosts deep', async () => {
		const r = await ServerRT.renderToString(srv.DeepNestedHead, {});
		expect(r.html).toContain('name="deep"');
		const bodyStart = r.html.indexOf('<main');
		expect(r.html.slice(bodyStart)).not.toContain('<meta');
		expect(r.html.slice(bodyStart)).toContain('class="deep-p"');
	});

	it('client-only render mounts nested metadata into document.head, owned and removable', () => {
		const root = createRoot(container);
		root.render(NestedHead, { title: 'Client Title' });
		flushSync(() => {});
		// The metadata mounted out-of-band; the host body holds only real children.
		expect(document.head.querySelector('title')?.textContent).toBe('Client Title');
		expect(document.head.querySelector('meta[name="desc"]')).not.toBeNull();
		expect(
			document.head.querySelectorAll('link[rel="stylesheet"][href="/nested.css"]'),
		).toHaveLength(1);
		expect(container.querySelector('title, meta, link')).toBeNull();
		expect(container.querySelector('.inner')).not.toBeNull();
		// Reactive: the title tracks its expression.
		root.render(NestedHead, { title: 'Updated Title' });
		flushSync(() => {});
		expect(document.head.querySelector('title')?.textContent).toBe('Updated Title');
		// Per-site metadata is removed with its owning scope; the Float resource
		// persists (resources are never removed).
		root.unmount();
		expect(document.head.querySelector('meta[name="desc"]')).toBeNull();
		expect(
			document.head.querySelectorAll('link[rel="stylesheet"][href="/nested.css"]'),
		).toHaveLength(1);
		document.head.querySelector('title')?.remove();
	});

	it('client-only render hoists metadata nested two hosts deep', () => {
		const root = createRoot(container);
		root.render(DeepNestedHead, {});
		flushSync(() => {});
		expect(document.head.querySelector('meta[name="deep"]')).not.toBeNull();
		expect(container.querySelector('meta')).toBeNull();
		expect(container.querySelector('.deep-p')).not.toBeNull();
		root.unmount();
		expect(document.head.querySelector('meta[name="deep"]')).toBeNull();
	});

	it('hydration adopts the nested-metadata host without mismatch warnings', async () => {
		const r = await ServerRT.renderToString(srv.NestedHead, { title: 'Nested Title' });
		// Land the head channel in the document head and the body in the container,
		// the way a served page arrives.
		const bodyStart = r.html.indexOf('<section');
		document.head.insertAdjacentHTML('beforeend', r.html.slice(0, bodyStart));
		container.innerHTML = r.html.slice(bodyStart);
		hydrateRoot(container, NestedHead, { title: 'Nested Title' });
		flushSync(() => {});
		const warns = errSpy.mock.calls.map((c) => String(c[0]));
		expect(warns.filter((m) => m.includes('hydration mismatch'))).toEqual([]);
		expect(container.querySelector('.inner')).not.toBeNull();
		expect(container.querySelector('title, meta, link')).toBeNull();
		// One stylesheet resource, adopted rather than duplicated.
		expect(
			document.head.querySelectorAll('link[rel="stylesheet"][href="/nested.css"]'),
		).toHaveLength(1);
		expect(document.head.querySelectorAll('meta[name="desc"]')).toHaveLength(1);
	});
});
