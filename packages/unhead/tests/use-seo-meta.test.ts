import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { createHead } from '@octanejs/unhead/client';
import { renderSSRHead } from '@octanejs/unhead/server';
import { SeoTitleAfterEffect, SeoTitleInput } from './_fixtures/use-head.tsrx';
import { withHead } from './_helpers';

describe('useSeoMeta hook', function useSeoMetaHook() {
	afterEach(function after() {
		cleanup();
	});

	// Per packages/unhead/upstream/canonical/test/useSeoMeta.test.tsx:51
	it('updates head title based on state', async function updatesTitleFromState() {
		const head = createHead();
		const view = render(withHead(head, createElement(SeoTitleInput)));

		const input = view.getByRole('textbox') as HTMLInputElement;
		// OCTANE DIVERGENCE: native per-keystroke events are `input`, not synthetic `change`.
		fireEvent.input(input, { target: { value: 'Updated Title' } });

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<title>Updated Title</title>');
	});

	// Per packages/unhead/upstream/canonical/test/useSeoMeta.test.tsx:67
	it('initializes input value with state', function initializesInput() {
		const head = createHead();
		const view = render(withHead(head, createElement(SeoTitleInput)));
		const input = view.getByRole('textbox') as HTMLInputElement;
		expect(input.value).toBe('Initial Title');
	});

	// Per packages/unhead/upstream/canonical/test/useSeoMeta.test.tsx:80
	it('updates head title based on ref value after effect', async function updatesAfterEffect() {
		const head = createHead();
		render(withHead(head, createElement(SeoTitleAfterEffect)));

		const rendered = await renderSSRHead(head);
		expect(rendered.headTags).toContain('<title>Updated Title</title>');
	});
});
