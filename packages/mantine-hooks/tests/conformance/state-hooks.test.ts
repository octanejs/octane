import { describe, expect, it, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { CounterWithOmittedOptions, FetchHooks, StateHooks } from '../_fixtures/state-hooks.tsrx';

describe('@octanejs/mantine-hooks state hooks', () => {
	it('uses counter defaults when TSRX omits options', () => {
		const result = mount(CounterWithOmittedOptions, {});
		expect(result.find('#optional-counter').textContent).toBe('1');
		expect(result.find('#default-counter').textContent).toBe('0');
		result.click('#optional-counter');
		expect(result.find('#optional-counter').textContent).toBe('2');
		result.unmount();
	});

	it('preserves Mantine state hook behavior through Octane renders', () => {
		const result = mount(StateHooks, {});

		expect(result.find('#count').textContent).toBe('1');
		result.click('#increment');
		expect(result.find('#count').textContent).toBe('2');
		result.click('#increment');
		expect(result.find('#count').textContent).toBe('2');

		expect(result.find('#opened').textContent).toBe('closed');
		result.click('#open');
		expect(result.find('#opened').textContent).toBe('open');

		result.click('#append');
		expect(result.find('#items').textContent).toBe('Ada,Grace');
		result.unmount();
	});

	it('keeps loading set while a replacement fetch is pending', async () => {
		const requests: Array<{
			resolve: (value: Response) => void;
			reject: (reason: Error) => void;
		}> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve, reject) => {
						requests.push({ resolve, reject });
					}),
			),
		);
		const result = mount(FetchHooks, {});

		result.click('#fetch');
		result.click('#fetch');
		requests[0].reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
		await Promise.resolve();
		await nextPaint();
		expect(result.find('#loading').textContent).toBe('loading');

		requests[1].resolve(new Response(JSON.stringify({ value: 'latest' }), { status: 200 }));
		await vi.waitFor(async () => {
			await nextPaint();
			expect(result.find('#loading').textContent).toBe('idle');
		});
		expect(result.find('#data').textContent).toBe('latest');
		result.unmount();
		vi.unstubAllGlobals();
	});
});
