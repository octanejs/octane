import { createClient } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { ClientProvider } from '../../src/client-provider.tsrx';
import { useClient } from '../../src/hooks/useClient';
import { NestedClientProbes, SingleClientProbe } from '../_fixtures/upstream/client-provider.tsrx';

function isThenable(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

describe('ClientProvider + useClient', () => {
	// Per upstream/src/__tests__/ClientProvider-test.browser.tsx:11.
	it('publishes the client to descendants and returns the same reference across renders', () => {
		const client = createClient();
		const seen: Array<ReturnType<typeof createClient>> = [];
		const result = mount(SingleClientProbe, {
			client,
			onRender: function onRender(value) {
				seen.push(value);
			},
		});
		flushEffects();
		expect(seen[0]).toBe(client);
		result.update(SingleClientProbe, {
			client,
			onRender: function onRender(value) {
				seen.push(value);
			},
		});
		flushEffects();
		expect(seen.at(-1)).toBe(client);
		result.unmount();
	});

	// Per upstream/src/__tests__/ClientProvider-test.browser.tsx:22.
	// OCTANE DIVERGENCE[solana-kit-missing-provider-error][runtime:32e73d9952587b2f]
	it('throws SolanaError MISSING_PROVIDER when `useClient` is called outside a provider', () => {
		function OutsideProvider() {
			useClient();
			return null;
		}
		expect(function callOutsideProvider() {
			mount(OutsideProvider as never);
		}).toThrow('useClient must be used inside ClientProvider');
	});

	// Per upstream/src/__tests__/ClientProvider-test.browser.tsx:34.
	it('lets the nearest provider win for nested mounts', () => {
		const outer = createClient();
		const inner = createClient();
		const onRenderOuter = vi.fn();
		const onRenderInner = vi.fn();
		const result = mount(NestedClientProbes, {
			outer,
			inner,
			onRenderOuter,
			onRenderInner,
		});
		flushEffects();
		expect(onRenderOuter).toHaveBeenCalledWith(outer);
		expect(onRenderOuter).not.toHaveBeenCalledWith(inner);
		expect(onRenderInner).toHaveBeenCalledWith(inner);
		expect(onRenderInner).not.toHaveBeenCalledWith(outer);
		result.unmount();
	});

	describe('async client', () => {
		// Per upstream/src/__tests__/ClientProvider-test.browser.tsx:65.
		// OCTANE DIVERGENCE[solana-kit-sync-client-only][runtime:8dce5b0ab8f4ae0a]: resolve before mount.
		it('renders the children once the client promise has resolved', () => {
			const client = createClient();
			const seen: Array<ReturnType<typeof createClient>> = [];
			const result = mount(SingleClientProbe, {
				client,
				onRender: function onRender(value) {
					seen.push(value);
				},
			});
			flushEffects();
			expect(seen[0]).toBe(client);
			expect(isThenable(client)).toBe(false);
			result.unmount();
		});

		// Per upstream/src/__tests__/ClientProvider-test.browser.tsx:88.
		// OCTANE DIVERGENCE[solana-kit-sync-client-only][runtime:14c8d6af4a82769f]: no Promise client / Suspense path.
		it('suspends while the promise is pending', () => {
			const pending = new Promise(function neverResolve() {});
			expect(function mountPendingClient() {
				mount(ClientProvider as never, {
					client: pending as never,
					children: null,
				});
			}).toThrow(/resolved client|ClientProvider/i);
		});

		// Per upstream/src/__tests__/ClientProvider-test.browser.tsx:107.
		// OCTANE DIVERGENCE[solana-kit-sync-client-only][runtime:fb3f27ba06fcb68d]: rejection is not an error-boundary path.
		it('lets a rejected client promise propagate to the nearest error boundary', () => {
			const boom = new Error('boom');
			const rejected = Promise.reject(boom);
			rejected.catch(function ignoreUnhandled() {});
			expect(function mountRejectedClient() {
				mount(ClientProvider as never, {
					client: rejected as never,
					children: null,
				});
			}).toThrow(/resolved client|ClientProvider/i);
		});
	});
});
