import { useForm } from '@octanejs/hook-form';

interface Profile {
	name: string;
	email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function App(props: { onSave: (profile: Profile) => void }) @{
	const { register, handleSubmit, formState: { errors } } = useForm<Profile>({ mode: 'onChange' });
	const submit = handleSubmit((profile) => props.onSave(profile));

	<form onSubmit={submit} noValidate>
		<h1>Edit profile</h1>
		<label for="name">Name</label>
		<input id="name" {...register('name', { required: 'Name is required' })} />
		@if (errors.name) {
			<p role="alert">
				{errors.name.message as string}
			</p>
		}

		<label for="email">Email</label>
		<input
			id="email"
			type="email"
			{...register('email', {
				required: 'Email is required',
				pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email' },
			})}
		/>
		@if (errors.email) {
			<p role="alert">
				{errors.email.message as string}
			</p>
		}

		<button type="submit">Save profile</button>
	</form>
}
