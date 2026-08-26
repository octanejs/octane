import { useState } from 'octane';
import {
	Form,
	insert,
	remove,
	reset,
	useField,
	useFieldArray,
	useForm,
	type FormStore,
} from '@octanejs/formisch';
import * as v from 'valibot';

const schema = v.object({
	email: v.pipe(v.string(), v.email('Use a valid email address.')),
	role: v.picklist(['reader', 'writer']),
	tags: v.array(v.object({ label: v.pipe(v.string(), v.minLength(1, 'Add a label.')) })),
});

type Schema = typeof schema;

function TagRow({
	form,
	index,
	onRemove,
}: {
	form: FormStore<Schema>;
	index: number;
	onRemove: () => void;
}) @{
	const field = useField(form, { path: ['tags', index, 'label'] });

	<div class="flex gap-2">
		<input
			class="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2"
			aria-label={`Tag ${index + 1}`}
			name={field.props.name}
			ref={field.props.ref}
			value={field.input as string}
			onInput={field.props.onInput}
			onBlur={field.props.onBlur}
		/>
		<button class="rounded-md border border-border px-3 py-2" type="button" onClick={onRemove}>
			Remove
		</button>
	</div>
}

export function FormischDemo() @{
	const [result, setResult] = useState('Nothing submitted yet.');
	const form = useForm({
		schema,
		initialInput: {
			email: '',
			role: 'reader',
			tags: [{ label: 'octane' }],
		},
		validate: 'input',
	});
	const email = useField(form, { path: ['email'] });
	const role = useField(form, { path: ['role'] });
	const tags = useFieldArray(form, { path: ['tags'] });

	<div class="mx-auto max-w-xl space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
		<div>
			<p class="text-sm font-medium text-muted-foreground">Schema-first forms</p>
			<h2 class="text-2xl font-semibold">Formisch + Octane</h2>
		</div>
		<Form
			class="space-y-4"
			of={form}
			onSubmit={async (output) => {
				await Promise.resolve();
				setResult(`${output.email} · ${output.role} · ${output.tags.length} tags`);
			}}
		>
			<label class="grid gap-1.5">
				<span class="text-sm font-medium">Email</span>
				<input
					class="rounded-md border border-border bg-background px-3 py-2"
					name={email.props.name}
					ref={email.props.ref}
					value={email.input as string}
					onFocus={email.props.onFocus}
					onInput={email.props.onInput}
					onBlur={email.props.onBlur}
					placeholder="you@example.com"
				/>
				@if (email.errors) {
					<span class="text-sm text-destructive">{email.errors[0]}</span>
				}
			</label>

			<label class="grid gap-1.5">
				<span class="text-sm font-medium">Role</span>
				<select
					class="rounded-md border border-border bg-background px-3 py-2"
					name={role.props.name}
					ref={role.props.ref}
					value={role.input as string}
					onChange={role.props.onChange}
				>
					<option value="reader">Reader</option>
					<option value="writer">Writer</option>
				</select>
			</label>

			<div class="grid gap-2">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">Tags</span>
					<button
						class="rounded-md border border-border px-3 py-1.5 text-sm"
						type="button"
						onClick={() => insert(form, { path: ['tags'], initialInput: { label: '' } })}
					>
						Add tag
					</button>
				</div>
				@for (const item of tags.items; key item) {
					<TagRow
						form={form}
						index={tags.items.indexOf(item)}
						onRemove={() => remove(form, { path: ['tags'], at: tags.items.indexOf(item) })}
					/>
				}
			</div>

			<div class="flex gap-2">
				<button class="rounded-md bg-primary px-4 py-2 text-primary-foreground" type="submit">
					{form.isSubmitting ? 'Submitting…' : 'Submit'}
				</button>
				<button
					class="rounded-md border border-border px-4 py-2"
					type="button"
					onClick={() => {
						reset(form);
						setResult('Reset to initial values.');
					}}
				>
					Reset
				</button>
			</div>
		</Form>
		<output class="block rounded-md bg-muted p-3 text-sm">{result}</output>
	</div>
}
