import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@octanejs/testing-library';
import { renderToString } from 'octane/server';
import toast, { Toaster } from '@octanejs/hot-toast';
import { toast as headlessToast, useToaster } from '@octanejs/hot-toast/headless';
import { App } from '../_fixtures/app.tsrx';
// @ts-expect-error the shared fixture plugin compiles this module for the server
import * as serverFixtures from '../_fixtures/app.tsrx?octane-ssr';

beforeEach(() => {
	toast.remove();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('@octanejs/hot-toast', () => {
	// The Toaster's pause handlers are native mouseenter and
	// mouseleave listeners on its container, which a pointer entering a toast
	// reaches; React synthesizes both from mouseover/mouseout.
	// @parity-case conformance:hot-toast-native-pause
	it('pauses the auto-dismiss timer while the pointer is over the Toaster', () => {
		vi.useFakeTimers();
		const { container } = render(Toaster);
		act(() => {
			toast('Hover me', { duration: 1000 });
		});
		const toaster = container.querySelector('[data-rht-toaster]')!;
		act(() => {
			vi.advanceTimersByTime(500);
		});

		fireEvent.mouseEnter(toaster);
		// Two separate turns: a dismissal in the first would queue the removal
		// that the second runs.
		act(() => {
			vi.advanceTimersByTime(5000);
		});
		act(() => {
			vi.advanceTimersByTime(5000);
		});
		expect(screen.queryByText('Hover me')).not.toBeNull();

		fireEvent.mouseLeave(toaster);
		act(() => {
			vi.advanceTimersByTime(600);
		});
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(screen.queryByText('Hover me')).toBeNull();
	});

	// Upstream bundles the root and /headless entries
	// separately, each with its own store; the port's entries share one.
	// @parity-case conformance:hot-toast-shared-headless-store
	it('shares one toast store between the root and /headless entries', () => {
		expect(headlessToast).toBe(toast);
		const { result } = renderHook(() => useToaster());
		act(() => {
			toast('From the root entry', { id: 'shared', duration: Infinity });
		});
		expect(result.current.toasts.map((t) => t.id)).toEqual(['shared']);
	});

	// Upstream calls goober's setup(React.createElement) when
	// it loads; the port renders its own elements and never calls setup().
	// @parity-case conformance:hot-toast-goober-pragma
	it("leaves the application's goober pragma in place", async () => {
		vi.resetModules();
		const { setup, styled } = await import('goober');
		const pragma = vi.fn(() => null);
		setup(pragma);
		await import('@octanejs/hot-toast');
		styled('span')`
			color: red;
		`({});
		expect(pragma).toHaveBeenCalledWith(
			'span',
			expect.objectContaining({ className: expect.stringMatching(/^go\d+$/) }),
		);
	});

	// @parity-case conformance:hot-toast-hydration
	it('hydrates the server Toaster and shows the first client toast in it', () => {
		const { html } = renderToString(serverFixtures.App, { position: 'bottom-right' });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const serverToaster = container.querySelector('[data-rht-toaster]');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			render(App, { container, hydrate: true, props: { position: 'bottom-right' } });
			expect(container.querySelector('[data-rht-toaster]')).toBe(serverToaster);

			act(() => {
				toast.success('Hydrated toast', { id: 'hydrated', duration: Infinity });
			});
			expect(serverToaster?.querySelector('[role="status"]')?.textContent).toBe('Hydrated toast');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			errors.mockRestore();
		}
	});
});
