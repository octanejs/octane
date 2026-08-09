import type { StoreRegistry } from '@livestore/livestore';
import { describe, expect, it } from 'vitest';
import { mount } from '../_helpers';
import {
	ContextRegistryReader,
	MissingRegistryReader,
	OverrideRegistryReader,
} from '../_fixtures/lifecycle.tsrx';

describe('registry context', () => {
	it('uses context, honors an explicit override, and reports missing context', () => {
		const registry = {} as StoreRegistry;
		const override = {} as StoreRegistry;
		const context = mount(ContextRegistryReader, { registry });
		expect(context.find('#registry').textContent).toBe('context');
		context.unmount();

		const overridden = mount(OverrideRegistryReader, { registry, override });
		expect(overridden.find('#registry').textContent).toBe('override');
		overridden.unmount();

		expect(function missingContext() {
			mount(MissingRegistryReader);
		}).toThrow('useStoreRegistry() must be used within <StoreRegistryProvider>');
	});
});
