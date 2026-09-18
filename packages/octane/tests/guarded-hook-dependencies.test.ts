import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import {
	GuardedIf,
	GuardedEarlyReturn,
	GuardedLogical,
	GuardedConditional,
	GuardedSwitch,
	GuardedLoop,
	GuardedTry,
	GuardedGetter,
	GuardedMemo,
} from './_fixtures/guarded-hook-dependencies.tsrx';

describe('guarded inferred dependencies', () => {
	it.each([
		['if', GuardedIf],
		['early return', GuardedEarlyReturn],
		['logical expression', GuardedLogical],
		['conditional expression', GuardedConditional],
		['switch', GuardedSwitch],
		['loop', GuardedLoop],
	] as const)('preserves %s guards while an optional receiver comes and goes', (_, body) => {
		const entries: string[] = [];
		const log = (value: string) => entries.push(value);
		const root = mount(body, { item: undefined, log });
		try {
			expect(root.container.textContent).toBe('Ready');
			expect(entries).toEqual([]);
			root.update(body, { item: { name: 'first', kind: 'value' }, log });
			root.update(body, { item: { name: 'second', kind: 'value' }, log });
			root.update(body, { item: undefined, log });
			expect(entries).toEqual(['first', 'second']);
			expect(root.container.textContent).toBe('Ready');
		} finally {
			root.unmount();
		}
	});

	it('keeps a protected property read inside its authored exception handler', () => {
		const entries: string[] = [];
		const log = (value: string) => entries.push(value);
		const root = mount(GuardedTry, { item: undefined, log });
		try {
			root.update(GuardedTry, { item: { name: 'present' }, log });
			expect(entries).toEqual(['missing', 'present']);
		} finally {
			root.unmount();
		}
	});

	it('does not evaluate a getter before its guard permits the read', () => {
		let enabled = false;
		const item = {
			get name() {
				if (!enabled) throw new Error('guard bypassed');
				return 'present';
			},
		};
		const entries: string[] = [];
		const log = (value: string) => entries.push(value);
		const root = mount(GuardedGetter, { item, enabled, log });
		try {
			expect(entries).toEqual([]);
			enabled = true;
			root.update(GuardedGetter, { item, enabled, log });
			expect(entries).toEqual(['present']);
			enabled = false;
			root.update(GuardedGetter, { item, enabled, log });
			expect(entries).toEqual(['present']);
		} finally {
			root.unmount();
		}
	});

	it('retains guarded memo fallback and refreshes it when the receiver changes', () => {
		const root = mount(GuardedMemo, { item: undefined });
		try {
			expect(root.container.textContent).toBe('empty');
			root.update(GuardedMemo, { item: { name: 'present' } });
			expect(root.container.textContent).toBe('present');
			root.update(GuardedMemo, { item: undefined });
			expect(root.container.textContent).toBe('empty');
		} finally {
			root.unmount();
		}
	});
});
