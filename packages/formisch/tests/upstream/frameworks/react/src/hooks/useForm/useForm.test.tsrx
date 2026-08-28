import { validate } from '@octanejs/formisch';
import { fireEvent, render, renderHook, screen, waitFor } from '@octanejs/testing-library';
import type { OctaneNode } from 'octane';
import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { useForm } from '@octanejs/formisch';

describe('useForm', () => {
	describe('initialization', () => {
		// Per frameworks/react/src/hooks/useForm/useForm.test.tsx:16
		test('should return form store with default state', () => {
			const { result } = renderHook(() => useForm({ schema: v.object({ name: v.string() }) }));

			const form = result.current;
			expect(form.isSubmitting).toBe(false);
			expect(form.isSubmitted).toBe(false);
			expect(form.isValidating).toBe(false);
			expect(form.isTouched).toBe(false);
			expect(form.isDirty).toBe(false);
			expect(form.isValid).toBe(true);
			expect(form.errors).toBe(null);
		});
	});

	describe('initial validation', () => {
		// Per frameworks/react/src/hooks/useForm/useForm.test.tsx:33
		test('should run validation on mount when validate is "initial"', async () => {
			const { result } = renderHook(
				() => useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.email('Invalid email')),
					}),
					validate: 'initial',
					initialInput: { email: 'invalid' },
				}),
			);

			await waitFor(() => {
				expect(result.current.isValid).toBe(false);
			});
		});

		// Per frameworks/react/src/hooks/useForm/useForm.test.tsx:49
		test('should not run validation on mount otherwise', () => {
			const { result } = renderHook(
				() => useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.email('Invalid email')),
					}),
					validate: 'blur',
					initialInput: { email: 'invalid' },
				}),
			);

			expect(result.current.isValidating).toBe(false);
			expect(result.current.isValid).toBe(true);
		});
	});

	describe('reactivity', () => {
		// Per frameworks/react/src/hooks/useForm/useForm.test.tsx:66
		test('should re-render the component when form state changes', async () => {
			function Test(): OctaneNode {
				const form = useForm({
					schema: v.object({
						email: v.pipe(v.string(), v.email('Invalid email')),
					}),
					initialInput: { email: 'invalid' },
				});
				return <div>
					<span data-testid="valid">{String(form.isValid)}</span>
					<button onClick={() => validate(form)}>Validate</button>
				</div>;
			}

			render(<Test />);

			const valid = screen.getByTestId('valid');
			expect(valid).toHaveTextContent('true');

			fireEvent.click(screen.getByText('Validate'));

			await waitFor(() => {
				expect(valid).toHaveTextContent('false');
			});
		});
	});

	describe('store stability', () => {
		// Per frameworks/react/src/hooks/useForm/useForm.test.tsx:96
		test('should return memoized store reference across re-renders', () => {
			const { result, rerender } = renderHook(
				() => useForm({ schema: v.object({ name: v.string() }) }),
			);

			const first = result.current;
			rerender();
			expect(result.current).toBe(first);
		});
	});
});
