// react-hook-form is deeply React-coupled — uncontrolled ref registration,
// React onChange semantics, controlled error re-renders. It runs unmodified:
// the compat layer translates text-input onChange and provides the
// SyntheticEvent surface it expects.
import { useForm } from 'react-hook-form';

interface SignupValues {
	email: string;
	plan: string;
}

export function SignupForm() {
	const {
		register,
		handleSubmit,
		watch,
		formState: { errors, isSubmitted },
	} = useForm<SignupValues>({ defaultValues: { email: '', plan: 'starter' } });

	return (
		<form className="signup" onSubmit={handleSubmit(() => {})}>
			<label>
				Email
				<input
					{...register('email', { required: 'Email is required', pattern: /.+@.+/ })}
					placeholder="you@example.com"
				/>
			</label>
			{errors.email && <span className="error">{errors.email.message || 'Invalid email'}</span>}
			<label>
				Plan
				<select {...register('plan')}>
					<option value="starter">Starter</option>
					<option value="pro">Pro</option>
				</select>
			</label>
			<button type="submit">Sign up</button>
			<p className="watch">
				Live watch: {watch('email') || '(empty)'} / {watch('plan')}
				{isSubmitted && !errors.email && ' — submitted!'}
			</p>
		</form>
	);
}
