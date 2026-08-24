/** @jsxImportSource octane */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@octanejs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';

import {
	Field,
	FieldArray,
	Form,
	getDirtyInput,
	getInput,
	insert,
	move,
	pickDirty,
	remove,
	setInput,
	useForm,
	type FormStore,
} from '../../src/index';

const Schema = v.object({
	email: v.pipe(v.string(), v.nonEmpty('Email is required'), v.email('Email is invalid')),
	tags: v.array(v.string()),
});

let captured!: FormStore<typeof Schema>;

function TestForm(props: { submit: (output: v.InferOutput<typeof Schema>) => void }) {
	const form = useForm({ schema: Schema, initialInput: { tags: ['a', 'b'] } });
	captured = form;
	return (
		<Form of={form} onSubmit={props.submit}>
			<Field of={form} path={['email']}>
				{(field) => (
					<div>
						<input aria-label="email" {...field.props} value={field.input} />
						<p role="alert">{field.errors?.[0] ?? 'ok'}</p>
						<p data-state="dirty">{field.isDirty ? 'dirty' : 'pristine'}</p>
					</div>
				)}
			</Field>
			<FieldArray of={form} path={['tags']}>
				{(array) => <output data-items="">{array.items.join(',')}</output>}
			</FieldArray>
			<button type="submit">Submit</button>
		</Form>
	);
}

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe('@octanejs/formisch', () => {
	it('provides schema defaults and updates through native input events', async () => {
		render(<TestForm submit={() => undefined} />);
		const input = screen.getByLabelText('email') as HTMLInputElement;
		expect(input.value).toBe('');
		expect(getInput(captured, { path: ['tags'] })).toEqual(['a', 'b']);

		fireEvent.input(input, { target: { value: 'person@example.com' } });
		await waitFor(() => expect(screen.getByText('dirty')).toBeTruthy());
		expect(getInput(captured, { path: ['email'] })).toBe('person@example.com');
		expect(getDirtyInput(captured)).toEqual({ email: 'person@example.com' });
	});

	// @parity-case differential:formisch-native-submit
	it('validates on submit, reports field errors, and only calls success with output', async () => {
		const submit = vi.fn();
		render(<TestForm submit={submit} />);
		fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!);
		await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Email is required'));
		expect(submit).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(screen.getByLabelText('email'));

		fireEvent.input(screen.getByLabelText('email'), {
			target: { value: 'person@example.com' },
		});
		await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('ok'));
		fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!);
		await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
		expect(submit.mock.calls[0]?.[0]).toEqual({ email: 'person@example.com', tags: ['a', 'b'] });
	});

	// @parity-case differential:formisch-field-array-identity
	it('keeps field-array identities stable across mutations', async () => {
		render(<TestForm submit={() => undefined} />);
		const initial = screen.getByText(/formisch-/).textContent!.split(',');
		await act(async () => insert(captured, { path: ['tags'], index: 1, input: 'x' }));
		const inserted = screen.getByText(/formisch-/).textContent!.split(',');
		expect(inserted).toHaveLength(3);
		expect(inserted[0]).toBe(initial[0]);
		expect(inserted[2]).toBe(initial[1]);
		await act(async () => move(captured, { path: ['tags'], from: 2, to: 0 }));
		const moved = screen.getByText(/formisch-/).textContent!.split(',');
		expect(moved[0]).toBe(initial[1]);
		await act(async () => remove(captured, { path: ['tags'], index: 1 }));
		expect((getInput(captured, { path: ['tags'] }) as string[]).length).toBe(2);
		expect(screen.getByText(/formisch-/).textContent!.split(',')).toHaveLength(2);
	});

	it('supports programmatic field updates', async () => {
		render(<TestForm submit={() => undefined} />);
		await act(async () =>
			setInput(captured, { path: ['email'], input: 'programmatic@example.com' }),
		);
		expect((screen.getByLabelText('email') as HTMLInputElement).value).toBe(
			'programmatic@example.com',
		);
	});

	it('picks values from an external input using the form dirty mask', async () => {
		render(<TestForm submit={() => undefined} />);
		await act(async () => setInput(captured, { path: ['email'], input: 'changed@example.com' }));
		expect(
			pickDirty(captured, {
				input: { email: 'external@example.com', tags: ['external'] },
			}),
		).toEqual({ email: 'external@example.com' });
	});

	// @parity-case differential:formisch-performance
	it('keeps programmatic store updates within a catastrophic-regression budget', () => {
		render(<TestForm submit={() => undefined} />);
		const startedAt = performance.now();
		for (let index = 0; index < 1_000; index += 1) {
			setInput(captured, { path: ['email'], input: `person-${index}@example.com` });
		}
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
