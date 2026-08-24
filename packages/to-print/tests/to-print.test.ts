import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@octanejs/testing-library';
import { useReactToPrint } from '@octanejs/to-print';

afterEach(function resetDom() {
	cleanup();
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('useReactToPrint', function useReactToPrintSuite() {
	// Per packages/to-print/upstream/src/hooks/useReactToPrint.ts
	it('returns a print callback', function returnsFn() {
		const { result } = renderHook(function useHook() {
			return useReactToPrint({ suppressErrors: true });
		});
		expect(typeof result.current).toBe('function');
	});

	it('logs when there is nothing to print', function logsMissingContent() {
		const error = vi.spyOn(console, 'error').mockImplementation(function noop() {});
		const { result } = renderHook(function useHook() {
			return useReactToPrint({});
		});
		result.current();
		expect(error).toHaveBeenCalled();
	});

	it('invokes a custom print function with the print iframe', async function customPrint() {
		const host = document.createElement('div');
		document.body.appendChild(host);
		const contentRef = { current: host };
		const print = vi.fn(async function fakePrint(_iframe: HTMLIFrameElement) {});
		const { result } = renderHook(function useHook() {
			return useReactToPrint({ contentRef, print, preserveAfterPrint: true });
		});
		result.current();
		await vi.waitFor(function printed() {
			expect(print).toHaveBeenCalled();
		});
		const iframe = print.mock.calls[0][0];
		expect(iframe.tagName).toBe('IFRAME');
	});
});
