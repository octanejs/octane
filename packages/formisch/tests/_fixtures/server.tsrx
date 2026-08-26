import { useField, useForm } from '@octanejs/formisch';
import * as v from 'valibot';

const schema = v.object({ name: v.string() });

export function ServerForm({ initial }: { initial: string }) @{
	const form = useForm({
		schema,
		initialInput: { name: initial },
	});
	const field = useField(form, { path: ['name'] });

	<form>
		<input id="name" name={field.props.name} value={field.input as string} />
		<output id="name-output">{field.input as string}</output>
	</form>
}
