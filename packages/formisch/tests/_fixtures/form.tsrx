import { render, waitFor } from '@octanejs/testing-library';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'octane';
import { Form, insert, reset, useField, useFieldArray, useForm } from '@octanejs/formisch';
import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';

const schema = v.object({
	email: v.pipe(v.string(), v.email('Enter a valid email')),
	role: v.picklist(['reader', 'writer']),
	tags: v.array(v.object({ label: v.string() })),
});

function Fixture({ onSubmit }: { onSubmit: (output: v.InferOutput<typeof schema>) => void }) {
	const [submitCount, setSubmitCount] = useState(0);
	const form = useForm({
		schema,
		initialInput: {
			email: '',
			role: 'reader',
			tags: [{ label: 'one' }],
		},
		validate: 'input',
	});
	const email = useField(form, { path: ['email'] });
	const role = useField(form, { path: ['role'] });
	const tags = useFieldArray(form, { path: ['tags'] });

	return <Form
		of={form}
		onSubmit={(output) => {
			onSubmit(output);
			setSubmitCount((count) => count + 1);
		}}
	>
		<input
			aria-label="Email"
			name={email.props.name}
			ref={email.props.ref}
			value={email.input as string}
			onFocus={email.props.onFocus}
			onInput={email.props.onInput}
			onBlur={email.props.onBlur}
		/>
		<select
			aria-label="Role"
			name={role.props.name}
			ref={role.props.ref}
			value={role.input as string}
			onChange={role.props.onChange}
		>
			<option value="reader">Reader</option>
			<option value="writer">Writer</option>
		</select>
		<p data-testid="email-error">{email.errors?.[0] ?? ''}</p>
		<p data-testid="tag-count">{String(tags.items.length)}</p>
		<p data-testid="submit-count">{String(submitCount)}</p>
		<button
			type="button"
			onClick={() => insert(form, { path: ['tags'], initialInput: { label: 'two' } })}
		>
			Add tag
		</button>
		<button type="button" onClick={() => reset(form)}>
			Reset
		</button>
		<button type="submit">Submit</button>
	</Form>;
}

describe('Formisch adapter', () => {
	it('updates text on input, select on change, arrays, reset, and submit', async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		const view = render(<Fixture onSubmit={onSubmit} />);
		const email = view.getByLabelText('Email');
		const role = view.getByLabelText('Role');

		await user.type(email, 'bad');
		await waitFor(
			() => expect(view.getByTestId('email-error')).toHaveTextContent('Enter a valid email'),
		);

		await user.clear(email);
		await user.type(email, 'valid@example.com');
		await user.selectOptions(role, 'writer');
		await user.click(view.getByText('Add tag'));
		expect(view.getByTestId('tag-count')).toHaveTextContent('2');

		await user.click(view.getByText('Submit'));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit.mock.calls[0][0]).toEqual({
			email: 'valid@example.com',
			role: 'writer',
			tags: [{ label: 'one' }, { label: 'two' }],
		});
		expect(view.getByTestId('submit-count')).toHaveTextContent('1');

		await user.click(view.getByText('Reset'));
		expect(email).toHaveValue('');
		expect(role).toHaveValue('reader');
		expect(view.getByTestId('tag-count')).toHaveTextContent('1');
	});
});
