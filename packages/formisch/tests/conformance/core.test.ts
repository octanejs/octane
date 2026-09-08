import {
	batch,
	createFormStore,
	createSignal,
	INTERNAL,
	setListener,
	type Listener,
} from '../../src/core/index.ts';
import { getInput } from '@octanejs/formisch';
import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';

describe('vendored Formisch core', () => {
	it('batches signal notifications and retracks subscriptions', () => {
		const first = createSignal(0);
		const second = createSignal(0);
		const notify = vi.fn();
		const listener: Listener = [notify, new Set()];

		setListener(listener);
		expect(first.value + second.value).toBe(0);
		setListener(undefined);
		batch(() => {
			first.value = 1;
			second.value = 2;
		});

		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('creates nested array stores from Valibot input', () => {
		const schema = v.object({
			name: v.string(),
			items: v.array(v.object({ done: v.boolean() })),
		});
		const internal = createFormStore(
			{
				schema,
				initialInput: { name: 'Ada', items: [{ done: false }] },
			},
			(input) => v.safeParseAsync(schema, input),
		);
		const form = { [INTERNAL]: internal };

		expect(getInput(form)).toEqual({
			name: 'Ada',
			items: [{ done: false }],
		});
	});
});
