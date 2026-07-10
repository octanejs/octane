// Differential fixtures — the SAME source runs through @octanejs/hook-form on
// octane AND (via the _setup.ts precompile, imports rewritten) through the real
// react-hook-form on React. Event wiring stays runtime-neutral: `{...register}`
// and `{...field}` spreads carry each runtime's own handler shape (octane:
// onInput; React: onChange), and both respond to the rig's native `input`
// dispatch. Programmatic interactions (reset/setValue/array ops) go through
// buttons so both sides drive identical code.
import { useForm, useFieldArray, Controller } from '@octanejs/hook-form';

export function RegisterForm() {
	const { register, handleSubmit, reset, setValue, formState: { errors, isDirty, submitCount } } =
		useForm({ mode: 'onChange', defaultValues: { name: '', email: '' } });

	return <form id="form" onSubmit={handleSubmit(() => {})}>
		<input id="name" {...register('name', { minLength: { value: 3, message: 'too short' } })} />
		<input id="email" {...register('email', { required: 'required' })} />
		<p id="name-error">
			{errors.name ? errors.name.message as string : 'ok'}
		</p>
		<p id="email-error">
			{errors.email ? errors.email.message as string : 'ok'}
		</p>
		<p id="dirty">
			{isDirty ? 'dirty' : 'pristine'}
		</p>
		<p id="submits">
			{'count: ' + submitCount}
		</p>
		<button id="submit" type="submit">{'submit'}</button>
		<button id="reset" type="button" onClick={() => reset()}>{'reset'}</button>
		<button
			id="set"
			type="button"
			onClick={() => setValue('name', 'from-setValue', { shouldDirty: true, shouldValidate: true })}
		>{'set'}</button>
	</form>;
}

export function ControllerForm() {
	const { control, reset } = useForm({ defaultValues: { pet: 'cat' } });

	return <div>
		<Controller
			control={control}
			name="pet"
			rules={{ required: 'required' }}
			render={({ field, fieldState }) => <div>
				<input id="pet" {...field} />
				<p id="pet-state">
					{fieldState.isDirty ? 'dirty' : 'clean'}
				</p>
				<p id="pet-error">
					{fieldState.error ? fieldState.error.message as string : 'ok'}
				</p>
			</div>
			}
		/>
		<button id="reset" type="button" onClick={() => reset({ pet: 'dog' })}>{'reset'}</button>
	</div>;
}

export function ArrayForm() {
	const { register, control } = useForm({
		defaultValues: { items: [{ v: 'a' }, { v: 'b' }] },
	});
	const { fields, append, prepend, remove, swap, move, update } = useFieldArray({
		control,
		name: 'items',
	});

	return <div>
		<ul id="list">{fields.map(
			(field, index) => <li key={field.id}>
				<input id={'item-' + index} {...register('items.' + index + '.v')} />
			</li>,
		)}</ul>
		<button id="append" type="button" onClick={() => append({ v: 'x' })}>{'append'}</button>
		<button id="prepend" type="button" onClick={() => prepend({ v: 'y' })}>{'prepend'}</button>
		<button id="remove" type="button" onClick={() => remove(0)}>{'remove'}</button>
		<button id="swap" type="button" onClick={() => swap(0, 1)}>{'swap'}</button>
		<button id="move" type="button" onClick={() => move(0, 1)}>{'move'}</button>
		<button
			id="update"
			type="button"
			onClick={() => update(0, { v: 'updated' })}
		>{'update'}</button>
	</div>;
}
