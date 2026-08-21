import { describe, expect, it } from 'vitest';
import { createSubSlot, subSlot } from '../src/index.js';
import * as Server from '../src/server/index.js';
import * as Universal from '../src/universal.js';
import * as UniversalNative from '../src/universal-native.js';

describe('binding hook-slot composition', () => {
	it('derives stable, distinct child slots while preserving a missing parent', () => {
		const parent = Symbol.for('test:binding-hook');
		const state = subSlot(parent, 'state');

		expect(state).toBe(subSlot(parent, 'state'));
		expect(state).not.toBe(subSlot(parent, 'effect'));
		expect(subSlot(undefined, 'state')).toBeUndefined();
	});

	it('supports stable slotless children and binding namespaces', () => {
		const namespaced = createSubSlot({
			parentPrefix: '@octanejs/example:',
			tagPrefix: ':hook:',
			slotlessPrefix: '@octanejs/example:bare:',
		});
		const parent = Symbol.for('component');

		expect(Symbol.keyFor(namespaced(parent, 'state'))).toBe(
			'@octanejs/example:component:hook:state',
		);
		expect(Symbol.keyFor(namespaced(undefined, 'state'))).toBe('@octanejs/example:bare:state');
		expect(namespaced(undefined, 'state')).toBe(namespaced(undefined, 'state'));
	});

	it('can keep child identity local to each parent symbol', () => {
		const local = createSubSlot({ global: false });
		const firstParent = Symbol('same-description');
		const secondParent = Symbol('same-description');
		const first = local(firstParent, 'state');

		expect(first).toBe(local(firstParent, 'state'));
		expect(first).not.toBe(local(secondParent, 'state'));
		expect(Symbol.keyFor(first!)).toBeUndefined();
	});

	it('can preserve global slotless identity with parent-local children', () => {
		const mixed = createSubSlot({
			global: false,
			slotlessGlobal: true,
			slotlessPrefix: '@octanejs/example:',
		});

		expect(Symbol.keyFor(mixed(undefined, 'state'))).toBe('@octanejs/example:state');
		expect(Symbol.keyFor(mixed(Symbol('parent'), 'state'))).toBeUndefined();
	});

	it('supports fixed and fallback parent descriptions', () => {
		const fallback = createSubSlot({
			parentPrefix: '@octanejs/example:',
			parentDescriptionFallback: 'anonymous',
		});
		const fixed = createSubSlot({
			parentPrefix: '@octanejs/example',
			includeParentDescription: false,
		});

		expect(Symbol.keyFor(fallback(Symbol(), 'state')!)).toBe('@octanejs/example:anonymous:state');
		expect(Symbol.keyFor(fixed(Symbol('ignored'), 'state')!)).toBe('@octanejs/example:state');
	});

	it('is available from every runtime entry used by bindings', () => {
		expect(Server.subSlot).toBe(subSlot);
		expect(Server.createSubSlot).toBe(createSubSlot);
		expect(Universal.subSlot).toBe(subSlot);
		expect(Universal.createSubSlot).toBe(createSubSlot);
		expect(UniversalNative.subSlot).toBe(subSlot);
		expect(UniversalNative.createSubSlot).toBe(createSubSlot);
	});
});
