/**
 * `render(ui, { hydrate: true })` — the option that routes through octane's
 * `hydrateRoot` instead of `createRoot`, so a test can drive a component over
 * DOM its own SSR produced.
 *
 * Server markup comes from the shared hydration harness
 * (`packages/octane/tests/_hydration-ssr.ts`), which compiles the fixture
 * through Vite's real SSR pipeline — the same route `@octanejs/aria` and
 * `@octanejs/base-ui` take. Provider and component-range markers are
 * renderer-specific, so hand-written HTML cannot stand in for it.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@octanejs/testing-library';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { HydratableCounter, HydrateWrapper } from './_fixtures/hydrate.tsrx';

const FIXTURE = 'packages/testing-library/tests/_fixtures/hydrate.tsrx';

let counterHtml: string;
let wrappedHtml: string;

beforeAll(async () => {
	// One SSR server spin-up per fixture export; the mismatch case re-uses
	// counterHtml by hydrating it with a different label.
	counterHtml = (
		await renderHydrationFixture('testing-library', FIXTURE, 'HydratableCounter', {
			label: 'Ada',
		})
	).html;
	wrappedHtml = (
		await renderHydrationFixture('testing-library', FIXTURE, 'WrappedCounter', { label: 'Grace' })
	).html;
});

afterEach(cleanup);

function serverContainer(html: string): HTMLElement {
	const container = document.body.appendChild(document.createElement('div'));
	container.innerHTML = html;
	return container;
}

describe('render({ hydrate: true })', () => {
	it('adopts the server nodes instead of remounting them', () => {
		const container = serverContainer(counterHtml);
		const serverButton = container.querySelector('[data-testid="button"]');
		const serverLabel = container.querySelector('[data-testid="label"]');
		const onMount = vi.fn();
		const onUnmount = vi.fn();
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const { getByTestId } = render(HydratableCounter, {
				container,
				hydrate: true,
				props: { label: 'Ada', onMount, onUnmount },
			});

			// The server's nodes are the ones now under the live root.
			expect(getByTestId('button')).toBe(serverButton);
			expect(getByTestId('label')).toBe(serverLabel);
			expect(errors).not.toHaveBeenCalled();
			// render() settles passive effects before returning (the same contract
			// the non-hydrating path carries), so the mount effect has run — once.
			expect(onMount).toHaveBeenCalledTimes(1);
		} finally {
			errors.mockRestore();
		}
	});

	it('leaves the adopted DOM interactive', () => {
		const container = serverContainer(counterHtml);
		const serverButton = container.querySelector('[data-testid="button"]') as HTMLButtonElement;
		const { getByTestId } = render(HydratableCounter, {
			container,
			hydrate: true,
			props: { label: 'Ada', onMount: vi.fn(), onUnmount: vi.fn() },
		});

		fireEvent.click(getByTestId('button'));

		// Same node, updated in place — a remount would have replaced it.
		expect(getByTestId('button')).toBe(serverButton);
		expect(serverButton.textContent).toBe('Count: 1');
	});

	it('hydrates through the wrapper render option', () => {
		const container = serverContainer(wrappedHtml);
		const serverWrapper = container.querySelector('[data-testid="wrapper"]');
		const serverButton = container.querySelector('[data-testid="button"]');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const { getByTestId } = render(HydratableCounter, {
				container,
				hydrate: true,
				wrapper: HydrateWrapper,
				props: { label: 'Grace', onMount: vi.fn(), onUnmount: vi.fn() },
			});

			expect(getByTestId('wrapper')).toBe(serverWrapper);
			expect(getByTestId('button')).toBe(serverButton);
			expect(errors).not.toHaveBeenCalled();
		} finally {
			errors.mockRestore();
		}
	});

	it('cleanup() unmounts a hydrated root and runs its effect cleanups', () => {
		const container = serverContainer(counterHtml);
		const serverButton = container.querySelector('[data-testid="button"]');
		const onUnmount = vi.fn();
		const { getByTestId } = render(HydratableCounter, {
			container,
			hydrate: true,
			props: { label: 'Ada', onMount: vi.fn(), onUnmount },
		});
		// The root being torn down is genuinely a HYDRATED one, not a fresh mount
		// that happens to sit in the same container.
		expect(getByTestId('button')).toBe(serverButton);

		cleanup();

		expect(onUnmount).toHaveBeenCalledTimes(1);
		expect(container.parentNode).toBeNull();
	});

	it('reports a hydration mismatch rather than adopting the wrong text', () => {
		// Server rendered "Ada"; the client renders "Grace" over it.
		const container = serverContainer(counterHtml);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const { getByTestId } = render(HydratableCounter, {
				container,
				hydrate: true,
				props: { label: 'Grace', onMount: vi.fn(), onUnmount: vi.fn() },
			});

			expect(errors).toHaveBeenCalled();
			// The client render is the source of truth after the mismatch.
			expect(getByTestId('label').textContent).toBe('Grace');
		} finally {
			errors.mockRestore();
		}
	});
});
