// Octane-specific event micro-suite — pins the native-event semantics every
// ported upstream test depends on BEFORE the big suites land:
//   - register() exposes onInput (per-keystroke, native `input`) + onBlur
//   - exactly ONE handler invocation per user action (no dual-listener
//     double-fire: the port deliberately does NOT listen to native `change`)
//   - Controller/useController field.onInput works programmatically (value or
//     event) and via {...field} spread as a CONTROLLED input
//   - unregister ordering with shouldUnregister (commit-phase ref detach)
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@octanejs/testing-library';
import { useForm, useController } from '@octanejs/hook-form';
import type { Control } from '@octanejs/hook-form';

describe('register(): native event surface', () => {
	it('returns name/ref/onInput/onBlur (no onChange key)', () => {
		let registerProps: Record<string, unknown> = {};
		function App() {
			const { register } = useForm();
			registerProps = register('test') as unknown as Record<string, unknown>;
			return <input {...register('test')} />;
		}
		render(<App />);
		expect(typeof registerProps.onInput).toBe('function');
		expect(typeof registerProps.onBlur).toBe('function');
		expect(typeof registerProps.ref).toBe('function');
		expect(registerProps.name).toBe('test');
		expect('onChange' in registerProps).toBe(false);
	});

	it('validates per keystroke with mode: onChange (native input event)', async () => {
		function App() {
			const {
				register,
				formState: { errors },
			} = useForm<{ name: string }>({ mode: 'onChange' });
			return (
				<div>
					<input {...register('name', { minLength: { value: 3, message: 'too short' } })} />
					<p role="alert">{errors.name ? errors.name.message : 'ok'}</p>
				</div>
			);
		}
		render(<App />);
		const input = screen.getByRole('textbox');

		fireEvent.input(input, { target: { value: 'ab' } });
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('too short'));

		fireEvent.input(input, { target: { value: 'abc' } });
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ok'));
	});

	it('fires the handler exactly once per checkbox click', async () => {
		const subscribed: unknown[] = [];
		let control!: Control<{ checked: boolean }>;
		function App() {
			const { register, control: c } = useForm<{ checked: boolean }>();
			control = c;
			return <input type="checkbox" {...register('checked')} />;
		}
		render(<App />);
		act(() => {
			control._subscribe({
				formState: { values: true },
				callback: (state) => subscribed.push(state.values),
			});
		});

		fireEvent.click(screen.getByRole('checkbox'));
		await waitFor(() => expect(subscribed.length).toBe(1));
		expect(screen.getByRole('checkbox')).toBeChecked();
	});

	it('routes blur to the blur path exactly once (touched set, no re-validate double-fire)', async () => {
		const validate = vi.fn(() => true);
		let touched = false;
		function App() {
			const {
				register,
				formState: { touchedFields },
			} = useForm<{ name: string }>({ mode: 'onTouched' });
			touched = !!touchedFields.name;
			return <input {...register('name', { validate })} />;
		}
		render(<App />);
		const input = screen.getByRole('textbox');

		fireEvent.input(input, { target: { value: 'a' } });
		fireEvent.blur(input);
		await waitFor(() => expect(touched).toBe(true));
		// onTouched mode: first validation happens on the blur — exactly once.
		await waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
	});
});

describe('useController field: onInput + controlled spread', () => {
	function ControlledInput(props: { control: Control<{ test: string }> }) {
		const { field } = useController({ name: 'test', control: props.control, defaultValue: '' });
		return <input {...field} />;
	}

	it('typing into a {...field} spread controlled input updates the value (no controlled-input dev error)', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		let control!: Control<{ test: string }>;
		function App() {
			const methods = useForm<{ test: string }>();
			control = methods.control;
			return <ControlledInput control={methods.control} />;
		}
		render(<App />);
		const input = screen.getByRole('textbox') as HTMLInputElement;

		fireEvent.input(input, { target: { value: 'hello' } });
		await waitFor(() => expect(input.value).toBe('hello'));
		expect(control._formValues.test).toBe('hello');
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it('field.onInput accepts a raw value programmatically (upstream field.onChange semantics)', async () => {
		let fieldOnInput!: (value: unknown) => void;
		let value = '';
		function App() {
			const { control } = useForm<{ test: string }>();
			const { field } = useController({ name: 'test', control, defaultValue: '' });
			fieldOnInput = field.onInput;
			value = field.value;
			return <p>{value}</p>;
		}
		render(<App />);

		await act(async () => {
			fieldOnInput('programmatic');
		});
		expect(value).toBe('programmatic');
	});
});

describe('unregister ordering (commit-phase ref detach)', () => {
	it('shouldUnregister: true removes the field value after conditional unmount', async () => {
		let control!: Control<{ test: string }>;
		function App(props: { show: boolean }) {
			const methods = useForm<{ test: string }>({ shouldUnregister: true });
			control = methods.control;
			return <div>{props.show ? <input {...methods.register('test')} /> : null}</div>;
		}
		const { rerender } = render(<App show={true} />);
		fireEvent.input(screen.getByRole('textbox'), { target: { value: 'data' } });
		await waitFor(() => expect(control._formValues.test).toBe('data'));

		await act(async () => {
			rerender(<App show={false} />);
		});
		await waitFor(() => expect(control._formValues.test).toBeUndefined());
	});
});
