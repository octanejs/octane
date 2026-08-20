import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement as el } from 'octane';
import { createHead, renderDOMHead, UnheadProvider } from '@octanejs/unhead/client';
import { ComponentTitlePage, PageSwitcher, PageWithTitle } from './_fixtures/use-head.tsrx';
import { wait } from './_helpers';

describe('issue #558 - unmount cleanup', function unmountCleanup() {
	afterEach(function after() {
		cleanup();
	});

	// Per packages/unhead/upstream/canonical/test/unmount-cleanup.test.tsx:44
	it('restores init values after component unmount (DOM rendering)', async function restoresAfterSwitch() {
		const head = createHead({
			init: [
				{
					title: 'Example fallback',
					meta: [{ name: 'description', content: 'some description' }],
				},
			],
		});

		const view = render(el(UnheadProvider, { head }, el(PageSwitcher)));

		await act(async function initial() {
			await renderDOMHead(head);
			await wait();
		});
		expect(document.title).toBe('Example fallback');

		await act(async function toPage1() {
			fireEvent.click(view.getByText('Page 1'));
			await wait();
		});
		await act(async function renderPage1() {
			await renderDOMHead(head);
			await wait();
		});
		expect(document.title).toBe('Page 1 title');

		await act(async function toPage2() {
			fireEvent.click(view.getByText('Page 2'));
			await wait();
		});
		await act(async function renderPage2() {
			await renderDOMHead(head);
			await wait();
		});
		expect(document.title).toBe('Example fallback');
	});

	// Per packages/unhead/upstream/canonical/test/unmount-cleanup.test.tsx:120
	it('direct unmount restores init values (DOM)', async function directUnmount() {
		const head = createHead({
			init: [
				{
					title: 'Init Title',
					meta: [{ name: 'description', content: 'init description' }],
				},
			],
		});

		const view = render(el(UnheadProvider, { head }, el(ComponentTitlePage)));

		await act(async function mount() {
			await renderDOMHead(head);
			await wait();
		});
		expect(document.title).toBe('Component Title');

		await act(async function unmount() {
			view.unmount();
			await wait();
		});
		await act(async function afterUnmount() {
			await renderDOMHead(head);
			await wait();
		});
		expect(document.title).toBe('Init Title');
	});

	// Per packages/unhead/upstream/canonical/test/unmount-cleanup.test.tsx:161
	it('entries state is correct through mount/unmount cycle', async function entriesCycle() {
		const head = createHead({
			init: [
				{
					title: 'Init',
				},
			],
		});

		expect(head.entries.size).toBe(1);

		const view = render(el(UnheadProvider, { head }, el(PageWithTitle)));

		await act(async function afterMount() {
			await wait();
		});
		expect(head.entries.size).toBe(2);

		await act(async function afterUnmount() {
			view.unmount();
			await wait();
		});
		expect(head.entries.size).toBe(1);
	});
});
