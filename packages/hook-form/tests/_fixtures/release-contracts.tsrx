import { useEffect } from 'octane';
import {
	ErrorMessage,
	FieldArray,
	Form,
	FormProvider,
	FormState,
	useForm,
} from '@octanejs/hook-form';
import type { FormSubmitHandler, UseFormReturn } from '@octanejs/hook-form';

export type ReleaseValues = {
	name: string;
	items: { value: string }[];
	attachment?: File;
};

export type ReleaseProps = {
	onReady?: (methods: UseFormReturn<ReleaseValues>) => void;
	onValue?: (name: string) => void;
	onPayload?: FormSubmitHandler<ReleaseValues>;
	action?: (data: FormData) => void | Promise<void>;
};

export function ReleaseForm({ onReady, onValue, onPayload, action }: ReleaseProps) {
	const methods = useForm<ReleaseValues>({
		mode: 'onChange',
		defaultValues: { name: 'Ada', items: [{ value: 'first' }, { value: 'second' }] },
	});
	useEffect(() => {
		onReady?.(methods);
		return methods.subscribe({
			formState: { values: true },
			callback: ({ values }) => onValue?.(values.name),
		});
	}, [methods.subscribe, onReady, onValue]);

	return <FormProvider {...methods}>
		<Form action={action} onSubmit={onPayload}>
			<label htmlFor="release-name">Name</label>
			<input id="release-name" {...methods.register('name', { required: 'Name is required' })} />
			<div role="alert">
				<ErrorMessage name="name" />
			</div>
			<div id="release-server-error">
				<ErrorMessage name="root.server" />
			</div>
			<FormState
				render={({ isDirty, isSubmitting, isSubmitSuccessful }) => <output
					id="release-state"
				>{JSON.stringify({
					isDirty,
					isSubmitting,
					isSubmitSuccessful,
				}) as string}</output>}
			/>
			<FieldArray
				control={methods.control}
				name="items"
				render={({ fields, append, swap, remove }) => <section>
					<ul>{fields.map(
						(field, index) => <li key={field.id}>
							<input aria-label={'Item ' + index} {...methods.register(`items.${index}.value`)} />
						</li>,
					)}</ul>
					<button type="button" id="release-swap" onClick={() => swap(0, 1)}>Swap</button>
					<button type="button" id="release-append" onClick={() => append({ value: 'third' })}>
						Append
					</button>
					<button type="button" id="release-remove" onClick={() => remove(0)}>Remove first</button>
				</section>}
			/>
			<button id="release-reset" type="button" onClick={() => methods.reset()}>Reset</button>
			<button id="release-submit" type="submit">Submit</button>
		</Form>
	</FormProvider>;
}
