import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@tanstack/octane-router';
import { decodeErrorMessage, errorCodes } from '../src/content/error-codes.ts';
import { getRouter, parseWebsiteSearch, stringifyWebsiteSearch } from '../src/router.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = getRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('error decoder', () => {
	it('preserves opaque and repeated production-error arguments', () => {
		const parsed = parseWebsiteSearch(
			'?args%5B%5D=%22quoted%22&args%5B%5D=null&args%5B%5D=true&note=01',
		);
		expect(parsed).toEqual({
			'args[]': ['"quoted"', 'null', 'true'],
			note: '01',
		});

		const roundTrip = new URLSearchParams(stringifyWebsiteSearch(parsed));
		expect(roundTrip.getAll('args[]')).toEqual(['"quoted"', 'null', 'true']);
		expect(roundTrip.get('note')).toBe('01');
	});

	it('retains the default search codec for keys outside the error arguments', () => {
		const parsed = parseWebsiteSearch('?page=2&filters=%7B%22active%22%3Atrue%7D&args%5B%5D=true');
		expect(parsed).toEqual({
			page: 2,
			filters: { active: true },
			'args[]': 'true',
		});

		const roundTrip = parseWebsiteSearch(stringifyWebsiteSearch(parsed));
		expect(roundTrip).toEqual(parsed);
	});

	it('lists every catalog entry and filters by its public message', async () => {
		const { container } = await renderRoute('/errors');
		expect(container.querySelectorAll('.error-card')).toHaveLength(errorCodes.length);

		const target = errorCodes.find((entry) => entry.message.includes('Children.only'))!;
		const input = container.querySelector<HTMLInputElement>('.errors-search')!;
		fireEvent.input(input, { target: { value: 'Children.only' } });
		await waitFor(() => expect(container.querySelectorAll('.error-card')).toHaveLength(1));
		expect(container.querySelector('.error-card-code')?.textContent).toContain('#' + target.code);
	});

	it('decodes repeated arguments as text without creating injected markup', async () => {
		const entry = errorCodes.find((candidate) => candidate.argumentCount > 0)!;
		const supplied = '<strong>diagnostic value</strong>';
		const extra = 'null';
		const url =
			'/errors/' +
			entry.code +
			'?args%5B%5D=' +
			encodeURIComponent(supplied) +
			'&args%5B%5D=' +
			encodeURIComponent(extra);
		const { container } = await renderRoute(url);

		const message = container.querySelector('.error-message')!;
		expect(message.textContent).toBe(decodeErrorMessage(entry.message, [supplied, extra]));
		expect(message.querySelector('strong')).toBeNull();
		expect(container.querySelector('.error-extra-args')?.textContent).toContain(extra);
	});

	it.each(['true', '0', '"quoted"'])(
		'decodes the single opaque argument %s through the real route',
		async (supplied) => {
			const entry = errorCodes.find((candidate) => candidate.argumentCount > 0)!;
			const { container } = await renderRoute(
				'/errors/' + entry.code + '?args%5B%5D=' + encodeURIComponent(supplied),
			);
			expect(container.querySelector('.error-message')?.textContent).toBe(
				decodeErrorMessage(entry.message, [supplied]),
			);
		},
	);

	it('shows missing placeholders and routes unknown codes to the 404 boundary', async () => {
		const entry = errorCodes.find((candidate) => candidate.argumentCount > 0)!;
		const known = await renderRoute('/errors/' + entry.code);
		expect(known.container.querySelector('.error-message')?.textContent).toContain('%s');
		expect(known.container.querySelector('.error-argument-note')?.textContent).toContain('missing');
		cleanup();

		const unknown = await renderRoute('/errors/999999');
		expect(unknown.container.querySelector('main .notfound')).toBeTruthy();
	});
});
