import {
	getDirtyInput,
	getInput,
	insert,
	move,
	remove,
	reset,
	setInput,
	swap,
} from '@octanejs/formisch';
import { createFormStore, INTERNAL } from '../../src/core/index.ts';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

const schema = v.object({
	name: v.string(),
	items: v.array(v.object({ label: v.string() })),
});

function createForm() {
	const internal = createFormStore(
		{
			schema,
			initialInput: {
				name: 'Ada',
				items: [{ label: 'one' }, { label: 'two' }],
			},
		},
		(input) => v.safeParseAsync(schema, input),
	);
	return { [INTERNAL]: internal };
}

describe('vendored Formisch methods', () => {
	it('mutates, reorders, removes, and resets typed inputs', () => {
		const form = createForm();

		setInput(form, { path: ['name'], input: 'Grace' });
		insert(form, { path: ['items'], at: 1, initialInput: { label: 'middle' } });
		move(form, { path: ['items'], from: 2, to: 0 });
		swap(form, { path: ['items'], at: 0, and: 1 });
		remove(form, { path: ['items'], at: 2 });

		expect(getInput(form)).toEqual({
			name: 'Grace',
			items: [{ label: 'one' }, { label: 'two' }],
		});
		expect(getDirtyInput(form)).toEqual({
			name: 'Grace',
		});

		reset(form);
		expect(getInput(form)).toEqual({
			name: 'Ada',
			items: [{ label: 'one' }, { label: 'two' }],
		});
	});

	it.each([
		['field input', { path: ['name'], input: 'Grace' }],
		['form input', { input: { name: 'Grace', items: [] } }],
	] as const)('validates change-mode %s updates', (_, config) => {
		const internal = createFormStore(
			{
				schema,
				initialInput: { name: 'Ada', items: [] },
				validate: 'change',
			},
			(input) => v.safeParseAsync(schema, input),
		);
		setInput({ [INTERNAL]: internal }, config);
		expect(internal.validators).toBe(1);
	});
});
