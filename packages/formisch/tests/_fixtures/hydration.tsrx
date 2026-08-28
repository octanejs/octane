import { useField, useForm } from '@octanejs/formisch';
import * as v from 'valibot';

const schema = v.object({ name: v.string() });

export function HydrationForm({ initial }: { initial: string }) @{
	const form = useForm({ schema, initialInput: { name: initial } });
	const field = useField(form, { path: ['name'] });

	<form>
		<input
			id="name"
			name={field.props.name}
			ref={field.props.ref}
			value={field.input as string}
			onInput={field.props.onInput}
		/>
		<output id="name-output">{field.input as string}</output>
	</form>
}
