import { createClient } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { useClient } from '../../src/hooks/useClient';
import { CapabilityApp } from '../_fixtures/upstream/use-client-capability.tsrx';

type ClientWithFoo = { foo: { hello(): string } };

describe('useClientCapability', () => {
	// Per upstream/src/__tests__/useClientCapability-test.browser.tsx:21.
	it('returns the client when the capability is present', () => {
		const client = createClient<ClientWithFoo>({ foo: { hello: () => 'world' } });
		const onRender = vi.fn();
		const result = mount(CapabilityApp, {
			client,
			capability: 'foo',
			hookName: 'useFoo',
			providerHint: 'Install fooPlugin().',
			onRender,
		});
		flushEffects();
		expect(onRender).toHaveBeenCalledWith(client);
		result.unmount();
	});

	// Per upstream/src/__tests__/useClientCapability-test.browser.tsx:35.
	// OCTANE DIVERGENCE[solana-kit-capability-error][runtime:f55bf79ffdd7ffe2]
	it('throws MISSING_CAPABILITY with hookName + providerHint when the capability is absent', () => {
		const client = createClient();
		expect(function missingCapability() {
			mount(CapabilityApp, {
				client,
				capability: 'foo',
				hookName: 'useFoo',
				providerHint: 'Install fooPlugin().',
				onRender: function onRender() {},
			});
		}).toThrow('useFoo requires client capability "foo". Install fooPlugin().');
	});

	// Per upstream/src/__tests__/useClientCapability-test.browser.tsx:60.
	// OCTANE DIVERGENCE[solana-kit-capability-error][runtime:697b90de86fb3bd4]: Octane reports the first missing entry.
	it('reports only the missing entries when capability is an array', () => {
		const client = createClient<{ rpc: object }>({ rpc: {} });
		expect(function missingSubscription() {
			mount(CapabilityApp, {
				client,
				capability: ['rpc', 'rpcSubscriptions'],
				hookName: 'useLiveData',
				providerHint: 'Install solanaRpcConnection().',
				onRender: function onRender() {},
			});
		}).toThrow(
			'useLiveData requires client capability "rpcSubscriptions". Install solanaRpcConnection().',
		);
	});

	// Per upstream/src/__tests__/useClientCapability-test.browser.tsx:82.
	// OCTANE DIVERGENCE[solana-kit-capability-error][runtime:5f370d960e375ce4]: first missing only.
	it('reports every missing entry when several capabilities are absent', () => {
		const client = createClient<{ rpc: object }>({ rpc: {} });
		expect(function missingSeveral() {
			mount(CapabilityApp, {
				client,
				capability: ['rpc', 'rpcSubscriptions', 'wallet'],
				hookName: 'useEverything',
				providerHint: 'Install the missing plugins.',
				onRender: function onRender() {},
			});
		}).toThrow(
			'useEverything requires client capability "rpcSubscriptions". Install the missing plugins.',
		);
	});

	// Per upstream/src/__tests__/useClientCapability-test.browser.tsx:105.
	// OCTANE DIVERGENCE[solana-kit-missing-provider-error][runtime:d775c531b3e8370b]
	it('underlying useClient throws MISSING_PROVIDER outside a provider', () => {
		function OutsideProvider() {
			useClient();
			return null;
		}
		expect(function callOutsideProvider() {
			mount(OutsideProvider as never);
		}).toThrow('useClient must be used inside ClientProvider');
	});
});
