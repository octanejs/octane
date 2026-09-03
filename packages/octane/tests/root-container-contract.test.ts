import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, setIsOctaneActEnvironment } from 'octane';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	DocumentView,
	DocumentWithMetadata,
	Label,
	NestedChildren,
	SuppressedLabel,
	SuppressedNestedChildren,
} from './_fixtures/root-container-contract.tsrx';
import Counter, { bump } from './_fixtures/act-warning.tsrx';
import { NoscriptChildren } from './conformance/_fixtures/server-integration-elements-remaining.tsrx';

const server = loadServerFixture('packages/octane/tests/_fixtures/root-container-contract.tsrx');

afterEach(() => {
	vi.unstubAllGlobals();
	setIsOctaneActEnvironment(false);
	vi.restoreAllMocks();
});

describe('public root containers and test environment', () => {
	it('rebuilds an incompatible host descriptor root without stale insertion anchors', () => {
		const container = document.createElement('div');
		container.innerHTML = '<aside>wrong</aside>';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, NoscriptChildren);
		expect(container.querySelector('noscript')?.textContent).toBe(
			'Enable JavaScript to run this app.',
		);
		flushSync(() => root.render(Label, { label: 'updated' }));
		expect(container.textContent).toBe('updated');
		root.unmount();
	});
	it('renders, updates and unmounts a Document while retaining its doctype', () => {
		const container = document.implementation.createHTMLDocument('old');
		const doctype = container.doctype;
		const root = createRoot(container);
		root.render(DocumentView, { label: 'mounted' });
		const html = container.documentElement;
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('mounted:0');
		flushSync(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(button.textContent).toBe('mounted:1');
		flushSync(() => root.render(DocumentView, { label: 'updated' }));
		expect(container.documentElement).toBe(html);
		expect(container.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('updated:1');
		root.unmount();
		expect(container.querySelector('button')).toBeNull();
		expect(container.doctype).toBe(doctype);
	});
	it('adopts a server-rendered Document and attaches live event handlers', () => {
		const html = renderToString(server.DocumentView, { label: 'hydrated' }).html;
		const container = new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
		const documentElement = container.documentElement;
		const button = container.querySelector('button')!;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(
			container,
			DocumentView,
			{ label: 'hydrated' },
			{ onRecoverableError },
		);
		flushSync(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(container.documentElement).toBe(documentElement);
		expect(container.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('hydrated:1');
		expect(onRecoverableError).not.toHaveBeenCalled();
		root.unmount();
	});
	it('allows a body root inside a hydrated document that retains its body', () => {
		const html = renderToString(server.DocumentView, { label: 'hydrated' }).html;
		const container = new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
		const documentRoot = hydrateRoot(container, DocumentView, { label: 'hydrated' });
		const bodyRoot = createRoot(container.body);
		bodyRoot.render(Label, { label: 'nested' });
		expect(container.body.textContent).toBe('nested');
		bodyRoot.unmount();
		documentRoot.unmount();
	});
	it('explains a missing body when document hydration replaces the document shell', () => {
		const container = document.implementation.createHTMLDocument('old');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, Label, { label: 'whole document' });
		expect(container.body).toBeNull();
		if (process.env.OCTANE_TEST_COMPILE_MODE !== 'prod') {
			expect(() => createRoot(container.body)).toThrow(
				'If document.body is null after document hydration, update the existing document root',
			);
		} else {
			expect(() => createRoot(container.body)).toThrow();
		}
		root.unmount();
	});
	it.each([false, true])(
		'mounts and updates metadata in its Document head (global: %s)',
		(global) => {
			const container = document.implementation.createHTMLDocument('old');
			if (global) vi.stubGlobal('document', container);
			const root = createRoot(container);
			root.render(DocumentWithMetadata, { label: 'mounted' });
			expect(container.title).toBe('mounted');
			expect(container.head.querySelector('meta')?.content).toBe('mounted');
			flushSync(() => root.render(DocumentWithMetadata, { label: 'updated' }));
			expect(container.title).toBe('updated');
			root.unmount();
		},
	);
	it('renders and hydrates detached DocumentFragment containers', () => {
		const mounted = document.createDocumentFragment();
		const root = createRoot(mounted);
		root.render(Label, { label: 'mounted' });
		expect(mounted.textContent).toBe('mounted');
		root.unmount();
		expect(mounted.childNodes.length).toBe(0);
		const template = document.createElement('template');
		template.innerHTML = renderToString(server.Label, { label: 'hydrated' }).html;
		const node = template.content.querySelector('span');
		const hydrated = hydrateRoot(template.content, Label, { label: 'hydrated' });
		expect(template.content.querySelector('span')).toBe(node);
		hydrated.unmount();
		expect(template.content.childNodes.length).toBe(0);
	});
	it('honors the React act environment flag and suppresses scoped updates', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
		const root = createRoot(document.createElement('div'));
		root.render(Counter);
		flushSync(() => {});
		error.mockClear();
		bump();
		flushSync(() => {});
		expect(
			error.mock.calls.some(([message]) => String(message).includes('not wrapped in act')),
		).toBe(true);
		error.mockClear();
		await act(() => bump());
		expect(error).not.toHaveBeenCalled();
		vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
		bump();
		flushSync(() => {});
		expect(error).not.toHaveBeenCalled();
		root.unmount();
	});
	it('reports a repaired text mismatch after hydration completes', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.Label, { label: 'server' }).html;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, Label, { label: 'client' }, { onRecoverableError });
		expect(container.textContent).toBe('client');
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledOnce();
		root.unmount();
	});
	it('removes surplus server children and reports their recovery', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = '<span>same<em>extra</em></span>';
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, Label, { label: 'same' }, { onRecoverableError });
		expect(container.textContent).toBe('same');
		expect(container.querySelector('em')).toBeNull();
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledOnce();
		root.unmount();
	});
	it('keeps intentionally suppressed server text and does not report recovery', async () => {
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.SuppressedLabel, { label: 'server' }).html;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(
			container,
			SuppressedLabel,
			{ label: 'client' },
			{ onRecoverableError },
		);
		await Promise.resolve();
		expect(container.textContent).toBe('server');
		expect(onRecoverableError).not.toHaveBeenCalled();
		root.unmount();
	});
	it('reports surplus children removed from nested descriptor hosts', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.NestedChildren, { label: 'same' }).html;
		container.querySelector('div')!.appendChild(document.createElement('em'));
		const span = container.querySelector('span');
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, NestedChildren, { label: 'same' }, { onRecoverableError });
		expect(container.querySelector('em')).toBeNull();
		expect(container.querySelector('span')).toBe(span);
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledOnce();
		root.unmount();
	});
	it('keeps suppression shallow and coalesces nested text recovery', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.SuppressedNestedChildren, { label: 'server' }).html;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(
			container,
			SuppressedNestedChildren,
			{ label: 'client' },
			{ onRecoverableError },
		);
		expect(container.textContent).toBe('client');
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledOnce();
		root.unmount();
	});
});
