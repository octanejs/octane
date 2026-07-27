// Phase 5: the server markup (all items in source order, stable useIds, and no
// empty state — items cannot register on the server, so Empty renders nothing
// there rather than claiming "no results" over a full list) hydrates without a
// mismatch, adopts the existing item nodes, and then activates — values infer
// from textContent, the first item selects, and typing filters.
import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
// Imported for its delegateEvents side effect (input/keydown/click) + flushEffects.
import { flushEffects } from '../../octane/tests/_helpers';
import { BasicMenu } from './_fixtures/basic.tsrx';

const SERVER_HTML =
	'<div tabindex="-1" cmdk-root=""><label cmdk-label="" for="radix-:in-2:" id="radix-:in-1:" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0, 0, 0, 0);white-space:nowrap;border-width:0;">Command Menu</label><!--[--><!--[--><!--[--><!--[--><input placeholder="Search…" cmdk-input="" autoComplete="off" autoCorrect="off" spellCheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="radix-:in-0:" aria-labelledby="radix-:in-1:" id="radix-:in-2:" type="text" value=""/><!--]--><!--[--><div cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="radix-:in-0:"><div cmdk-list-sizer=""><!--[--><!--[--><!--[--><!--]--><!--]--><!--[--><!--[--><!--[--><div id="radix-:in-3:" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false"><!--[-->Apple<!--]--></div><!--]--><!--]--><!--]--><!--[--><!--[--><!--[--><div id="radix-:in-4:" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false"><!--[-->Banana<!--]--></div><!--]--><!--]--><!--]--><!--[--><!--[--><!--[--><div id="radix-:in-5:" cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false"><!--[-->Cherry<!--]--></div><!--]--><!--]--><!--]--><!--]--></div></div><!--]--><!--]--><!--]--><!--]--></div>';

async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushEffects();
	flushSync(() => {});
}

describe('@octanejs/cmdk — hydration', () => {
	it('adopts the server DOM without a mismatch and activates after hydration', async () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);
		const serverApple = container.querySelector('[cmdk-item]');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, BasicMenu);
		await settle();

		// No hydration mismatch was reported.
		expect(error).not.toHaveBeenCalled();
		// The server's first item node was adopted, not replaced.
		expect(container.querySelector('[cmdk-item]')).toBe(serverApple);

		// Post-hydration: value inferred from textContent, first item selected, and
		// Empty still absent (the filter count is now the item count).
		expect(serverApple?.getAttribute('data-value')).toBe('Apple');
		expect(container.querySelector('[cmdk-item][aria-selected="true"]')?.textContent).toBe('Apple');
		expect(container.querySelector('[cmdk-empty]')).toBeNull();

		// Live after hydration: typing filters the list.
		const input = container.querySelector('[cmdk-input]') as HTMLInputElement;
		input.value = 'ban';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		expect([...container.querySelectorAll('[cmdk-item]')].map((el) => el.textContent)).toEqual([
			'Banana',
		]);

		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
