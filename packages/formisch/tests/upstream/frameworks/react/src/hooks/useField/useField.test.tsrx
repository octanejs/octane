import { reset } from '@octanejs/formisch';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@octanejs/testing-library';
import { type OctaneNode, useState } from 'octane';
import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { Form } from '@octanejs/formisch';
import type { FormStore } from '@octanejs/formisch';
import { useForm } from '@octanejs/formisch';
import { useField } from '@octanejs/formisch';

describe('useField', () => {
	describe('initialization', () => {
		// Per frameworks/react/src/hooks/useField/useField.test.tsx:20
		test('should return field store with default state and props', () => {
			const { result } = renderHook(() => {
				const form = useForm({ schema: v.object({ name: v.string() }) });
				return useField(form, { path: ['name'] });
			});

			const field = result.current;
			expect(field.path).toEqual(['name']);
			expect(field.input).toBe('');
			expect(field.errors).toBe(null);
			expect(field.isTouched).toBe(false);
			expect(field.isEdited).toBe(false);
			expect(field.isDirty).toBe(false);
			expect(field.isValid).toBe(true);
			expect(field.props.name).toBe('["name"]');
			expect(field.props.autoFocus).toBe(false);
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:38
		test('should reflect initialInput from form', () => {
			const { result } = renderHook(() => {
				const form = useForm({
					schema: v.object({ name: v.string() }),
					initialInput: { name: 'John' },
				});
				return useField(form, { path: ['name'] });
			});

			expect(result.current.input).toBe('John');
		});
	});

	describe('input updates', () => {
		// Per frameworks/react/src/hooks/useField/useField.test.tsx:52
		test('should update input and isDirty via DOM onChange', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({ name: v.string() }),
					initialInput: { name: 'initial' },
				});
				const field = useField(form, { path: ['name'] });
				return <div>
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<span data-testid="dirty">{String(field.isDirty)}</span>
				</div>;
			}

			render(<Test />);

			const input = screen.getByTestId('input') as HTMLInputElement;
			const dirty = screen.getByTestId('dirty');
			expect(input.value).toBe('initial');
			expect(dirty).toHaveTextContent('false');

			fireEvent.input(input, { target: { value: 'changed' } });

			await waitFor(() => {
				expect(input.value).toBe('changed');
				expect(dirty).toHaveTextContent('true');
			});
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:86
		test('should update input and trigger validation via imperative onChange', async () => {
			const { result } = renderHook(() => {
				const form = useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.email('Invalid email')),
					}),
					validate: 'input',
					initialInput: { email: '' },
				});
				return useField(form, { path: ['email'] });
			});

			act(() => {
				result.current.onChange('not-an-email');
			});

			expect(result.current.input).toBe('not-an-email');

			await waitFor(() => {
				expect(result.current.errors).toEqual(['Invalid email']);
				expect(result.current.isValid).toBe(false);
			});
		});
	});

	describe('edited state', () => {
		// Per frameworks/react/src/hooks/useField/useField.test.tsx:112
		test('should not set isEdited on focus but should set isTouched', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({ name: v.string() }),
					initialInput: { name: '' },
				});
				const field = useField(form, { path: ['name'] });
				return <div>
					<input data-testid="input" {...field.props} />
					<span data-testid="touched">{String(field.isTouched)}</span>
					<span data-testid="edited">{String(field.isEdited)}</span>
				</div>;
			}

			render(<Test />);

			const touched = screen.getByTestId('touched');
			const edited = screen.getByTestId('edited');

			fireEvent.focus(screen.getByTestId('input'));

			// Focusing marks the field as touched, but not as edited
			await waitFor(() => {
				expect(touched).toHaveTextContent('true');
			});
			expect(edited).toHaveTextContent('false');
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:142
		test('should set isEdited on input', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({ name: v.string() }),
					initialInput: { name: '' },
				});
				const field = useField(form, { path: ['name'] });
				return <div>
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<span data-testid="edited">{String(field.isEdited)}</span>
				</div>;
			}

			render(<Test />);

			const edited = screen.getByTestId('edited');
			expect(edited).toHaveTextContent('false');

			fireEvent.input(screen.getByTestId('input'), {
				target: { value: 'changed' },
			});

			await waitFor(() => {
				expect(edited).toHaveTextContent('true');
			});
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:175
		test('should keep isEdited after reverting the value to its initial value', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({ name: v.string() }),
					initialInput: { name: 'initial' },
				});
				const field = useField(form, { path: ['name'] });
				return <div>
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<span data-testid="edited">{String(field.isEdited)}</span>
					<span data-testid="dirty">{String(field.isDirty)}</span>
				</div>;
			}

			render(<Test />);

			const input = screen.getByTestId('input') as HTMLInputElement;
			const edited = screen.getByTestId('edited');
			const dirty = screen.getByTestId('dirty');

			fireEvent.input(input, { target: { value: 'changed' } });
			await waitFor(() => {
				expect(edited).toHaveTextContent('true');
				expect(dirty).toHaveTextContent('true');
			});

			// Reverting to the initial value clears isDirty but keeps isEdited
			fireEvent.input(input, { target: { value: 'initial' } });
			await waitFor(() => {
				expect(dirty).toHaveTextContent('false');
			});
			expect(edited).toHaveTextContent('true');
		});
	});

	describe('validation modes', () => {
		// Per frameworks/react/src/hooks/useField/useField.test.tsx:217
		test('should run validate:"touch" on focus and flip isTouched', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.nonEmpty('Required')),
					}),
					validate: 'touch',
					initialInput: { email: '' },
				});
				const field = useField(form, { path: ['email'] });
				return <div>
					<input data-testid="input" {...field.props} />
					<span data-testid="touched">{String(field.isTouched)}</span>
					<span data-testid="valid">{String(field.isValid)}</span>
				</div>;
			}

			render(<Test />);

			const touched = screen.getByTestId('touched');
			const valid = screen.getByTestId('valid');
			expect(touched).toHaveTextContent('false');
			expect(valid).toHaveTextContent('true');

			fireEvent.focus(screen.getByTestId('input'));

			await waitFor(() => {
				expect(touched).toHaveTextContent('true');
				expect(valid).toHaveTextContent('false');
			});
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:251
		test('should run validate:"input" on change and surface errors', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.email('Invalid email')),
					}),
					validate: 'input',
					initialInput: { email: '' },
				});
				const field = useField(form, { path: ['email'] });
				return <div>
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<span data-testid="valid">{String(field.isValid)}</span>
					{field.errors && <span data-testid="error">{field.errors[0]}</span>}
				</div>;
			}

			render(<Test />);

			const valid = screen.getByTestId('valid');
			expect(valid).toHaveTextContent('true');

			fireEvent.input(screen.getByTestId('input'), {
				target: { value: 'bad' },
			});

			await waitFor(() => {
				expect(valid).toHaveTextContent('false');
				expect(screen.getByTestId('error')).toHaveTextContent('Invalid email');
			});
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:289
		test('should run validate:"blur" on blur and surface errors', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.email('Invalid email')),
					}),
					validate: 'blur',
					initialInput: { email: 'invalid' },
				});
				const field = useField(form, { path: ['email'] });
				return <div>
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<span data-testid="valid">{String(field.isValid)}</span>
				</div>;
			}

			render(<Test />);

			const valid = screen.getByTestId('valid');
			expect(valid).toHaveTextContent('true');

			fireEvent.blur(screen.getByTestId('input'));

			await waitFor(() => {
				expect(valid).toHaveTextContent('false');
			});
		});
	});

	describe('store stability', () => {
		// Per frameworks/react/src/hooks/useField/useField.test.tsx:325
		test('should return memoized store reference across re-renders', () => {
			const { result, rerender } = renderHook(() => {
				const form = useForm({ schema: v.object({ name: v.string() }) });
				return useField(form, { path: ['name'] });
			});

			const first = result.current;
			rerender();
			expect(result.current).toBe(first);
		});
	});

	describe('element registration', () => {
		// Per frameworks/react/src/hooks/useField/useField.test.tsx:338
		test('should focus the registered element when validation fails on submit', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.nonEmpty('Required')),
					}),
					initialInput: { email: '' },
				});
				const field = useField(form, { path: ['email'] });
				return <Form of={form} onSubmit={vi.fn()} aria-label="Test">
					<input data-testid="input" {...field.props} value={field.input ?? ''} />
					<button type="submit">Submit</button>
				</Form>;
			}

			render(<Test />);

			const input = screen.getByTestId('input');
			expect(document.activeElement).not.toBe(input);

			fireEvent.submit(screen.getByRole('form', { name: 'Test' }));

			await waitFor(() => {
				expect(document.activeElement).toBe(input);
			});
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:371
		test('should focus a remounted field after reset instead of a stale element', async () => {
			const schema = v.object({
				email: v.pipe(v.string(), v.nonEmpty('Required')),
			});

			// The field lives in its own component so unmounting it runs the
			// adapter cleanup (which reassigns `elements`), the way a real
			// conditionally rendered field does
			function EmailField({ form }: { form: FormStore<typeof schema> }): OctaneNode {
				const field = useField(form, { path: ['email'] });
				return <input data-testid="input" {...field.props} value={field.input ?? ''} />;
			}

			function Test(): OctaneNode {
				const form = useForm({ schema, initialInput: { email: '' } });
				const [show, setShow] = useState(true);
				return <Form of={form} onSubmit={vi.fn()} aria-label="Test">
					{show && <EmailField form={form} />}
					<button type="button" onClick={() => setShow((value) => !value)}>
						toggle
					</button>
					<button type="button" onClick={() => reset(form)}>
						reset
					</button>
					<button type="submit">Submit</button>
				</Form>;
			}

			render(<Test />);

			// Unmount then remount the field so the adapter cleanup reassigns
			// `elements` and a stale `initialElements` would diverge
			act(() => {
				fireEvent.click(screen.getByText('toggle'));
			});
			expect(screen.queryByTestId('input')).toBeNull();
			act(() => {
				fireEvent.click(screen.getByText('toggle'));
			});

			// Reset the form, then submit so validation focuses the first error field
			act(() => {
				fireEvent.click(screen.getByText('reset'));
			});
			fireEvent.submit(screen.getByRole('form', { name: 'Test' }));

			// Focus must land on the live remounted input, not a detached baseline
			await waitFor(() => {
				expect(document.activeElement).toBe(screen.getByTestId('input'));
			});
		});

		// Per frameworks/react/src/hooks/useField/useField.test.tsx:435
		test('should unmount cleanly when the registered element is removed', () => {
			function Test(): OctaneNode {
				const form = useForm({ schema: v.object({ name: v.string() }) });
				const field = useField(form, { path: ['name'] });
				return <input data-testid="input" {...field.props} />;
			}

			const { unmount } = render(<Test />);
			expect(screen.getByTestId('input')).toBeInTheDocument();

			unmount();

			expect(screen.queryByTestId('input')).toBeNull();
		});
	});
});
