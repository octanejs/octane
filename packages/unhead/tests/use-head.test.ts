import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { createHead, renderDOMHead, UnheadProvider } from '@octanejs/unhead/client';
import { renderSSRHead } from '@octanejs/unhead/server';
import { DarkClassToggle, TitleInput, TitleMetaInput } from './_fixtures/use-head.tsrx';
import { withHead } from './_helpers';

describe('useHead hook', function useHeadHook() {
	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:61
	beforeEach(async function resetDocument() {
		await new Promise(function wait(resolve) {
			setTimeout(resolve, 10);
		});
		document.documentElement.className = '';
		document.body.className = '';
	});

	afterEach(function after() {
		cleanup();
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:68
	it('updates head title based on state', async function updatesTitleFromState() {
		const head = createHead();
		const view = render(withHead(head, createElement(TitleInput)));

		const input = view.getByRole('textbox') as HTMLInputElement;
		// OCTANE DIVERGENCE: native per-keystroke events are `input`, not synthetic `change`.
		fireEvent.input(input, { target: { value: 'Updated Title' } });

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<title>Updated Title</title>');
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:84
	it('uses the head instance supplied through the universal value prop', async function usesValueProp() {
		const head = createHead();

		render(createElement(UnheadProvider, { value: head }, createElement(TitleInput)));

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<title>Initial Title</title>');
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:97
	it('rejects conflicting value and head props', function rejectsBothProps() {
		const value = createHead();
		const head = createHead();

		expect(function renderBoth() {
			render(createElement(UnheadProvider, { value, head } as never, createElement(TitleInput)));
		}).toThrowError('UnheadProvider received both value and head props');
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:109
	it('initializes input value with state', function initializesInput() {
		const head = createHead();
		const view = render(withHead(head, createElement(TitleInput)));
		const input = view.getByRole('textbox') as HTMLInputElement;
		expect(input.value).toBe('Initial Title');
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:121
	it('updates head title and meta tags based on state', async function updatesTitleAndMeta() {
		const head = createHead();
		const view = render(withHead(head, createElement(TitleMetaInput)));

		const inputs = view.getAllByRole('textbox') as HTMLInputElement[];
		fireEvent.input(inputs[0], { target: { value: 'Updated Title' } });
		fireEvent.input(inputs[1], { target: { value: 'Updated Description' } });

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<title>Updated Title</title>');
		expect(rendered.headTags).toContain('<meta name="description" content="Updated Description">');
		expect(rendered.headTags).toContain('<meta property="og:title" content="Updated Title">');
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:142
	it('initializes input values with state', function initializesMemoInputs() {
		const head = createHead();
		const view = render(withHead(head, createElement(TitleMetaInput)));
		const inputs = view.getAllByRole('textbox') as HTMLInputElement[];
		expect(inputs[0].value).toBe('Initial Title');
		expect(inputs[1].value).toBe('Initial Description');
	});

	// Per packages/unhead/upstream/canonical/test/useHead.test.tsx:158
	it('properly toggles classes on html element', async function togglesHtmlClass() {
		const head = createHead();
		const view = render(withHead(head, createElement(DarkClassToggle)));
		const button = view.getByRole('button');
		const htmlElement = document.documentElement;

		await act(async function firstRender() {
			await renderDOMHead(head);
		});

		expect(htmlElement.classList.contains('dark')).toBe(false);
		expect(view.getByText('light')).toBeTruthy();

		await act(function clickDark() {
			fireEvent.click(button);
		});
		await act(async function renderDark() {
			await renderDOMHead(head);
		});
		expect(htmlElement.classList.contains('dark')).toBe(true);
		expect(view.getByText('dark')).toBeTruthy();

		await act(function clickLight() {
			fireEvent.click(button);
		});
		await act(async function renderLight() {
			await renderDOMHead(head);
		});
		expect(htmlElement.classList.contains('dark')).toBe(false);
		expect(view.getByText('light')).toBeTruthy();
	});
});
