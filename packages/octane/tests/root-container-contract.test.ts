import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, setIsOctaneActEnvironment } from 'octane';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	DocumentView,
	DocumentWithMetadata,
	GatedDocument,
	HoistedTitleDocument,
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
		container.innerHTML = '<!--3--><aside>wrong</aside>';
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
	it("keeps a Document's content until its first render commits, then keeps its doctype", async () => {
		const container = document.implementation.createHTMLDocument('old');
		const doctype = container.doctype;
		const html = container.documentElement;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(container, { subtree: true, childList: true, attributes: true });
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const root = createRoot(container);
		try {
			// The first render builds off-document and suspends: the document is as it was.
			flushSync(() => root.render(GatedDocument, { gate, label: 'mounted' }));
			records.push(...observer.takeRecords());
			expect(records).toEqual([]);
			expect(container.documentElement).toBe(html);
			expect(container.title).toBe('old');
			await act(async () => open());
			expect(container.documentElement).not.toBe(html);
			expect(container.title).toBe('mounted');
			expect(container.querySelector('p')?.textContent).toBe('mounted');
			expect(container.doctype).toBe(doctype);
		} finally {
			observer.disconnect();
			root.unmount();
		}
		expect(container.doctype).toBe(doctype);
	});
	it("replaces a Document root's component at commit, keeping its doctype", async () => {
		const container = document.implementation.createHTMLDocument('old');
		const doctype = container.doctype;
		const root = createRoot(container);
		root.render(DocumentView, { label: 'first' });
		const button = container.querySelector('button')!;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(container, { subtree: true, childList: true, attributes: true });
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		try {
			flushSync(() => root.render(GatedDocument, { gate, label: 'second' }));
			records.push(...observer.takeRecords());
			expect(records).toEqual([]);
			expect(button.isConnected).toBe(true);
			await act(async () => open());
			expect(button.isConnected).toBe(false);
			expect(container.querySelectorAll('html')).toHaveLength(1);
			expect(container.title).toBe('second');
			expect(container.doctype).toBe(doctype);
		} finally {
			observer.disconnect();
			root.unmount();
		}
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
	it("mounts over a server Document with its own head, not the server's", () => {
		const html = renderToString(server.HoistedTitleDocument, { label: 'server' }).html;
		const container = new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
		const doctype = container.doctype;
		const root = createRoot(container);
		flushSync(() => root.render(HoistedTitleDocument, { label: 'client' }));
		expect(container.querySelectorAll('title')).toHaveLength(1);
		expect(container.title).toBe('client');
		expect(container.body.textContent).toBe('client');
		expect(container.doctype).toBe(doctype);
		root.unmount();
	});
	it('replaces a server Document whose hydration fails with its own head', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const html = renderToString(server.HoistedTitleDocument, { label: 'server' }).html;
		const container = new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
		const doctype = container.doctype;
		const serverHtml = container.documentElement;
		// A body that no longer matches fails the attempt, which claimed the head's title.
		container.querySelector('p')!.replaceWith(container.createElement('div'));
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(
			container,
			HoistedTitleDocument,
			{ label: 'client' },
			{ onRecoverableError },
		);
		flushSync(() => {});
		expect(serverHtml.isConnected).toBe(false);
		expect(container.querySelectorAll('title')).toHaveLength(1);
		expect(container.title).toBe('client');
		expect(container.body.textContent).toBe('client');
		expect(container.doctype).toBe(doctype);
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledOnce();
		root.unmount();
	});
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
		container.innerHTML = '<!--3--><span>same<em>extra</em></span>';
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
	it('renders the root on the client for surplus children of a nested descriptor host', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.NestedChildren, { label: 'same' }).html;
		container.querySelector('div')!.appendChild(document.createElement('em'));
		const span = container.querySelector('span')!;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, NestedChildren, { label: 'same' }, { onRecoverableError });
		expect(container.querySelector('em')).toBeNull();
		expect(container.querySelector('span')!.textContent).toBe('same');
		expect(span.isConnected).toBe(false);
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
