/**
 * Shared differential scenario — the same source mounts through
 * `@octanejs/formisch` on Octane and (via differential/_setup.ts import
 * rewrite) through real `@formisch/react` on React.
 */
import { useField, useForm } from '@octanejs/formisch';
import * as v from 'valibot';

const schema = v.object({
	email: v.pipe(v.string(), v.email('invalid')),
});

export function DifferentialForm() @{
	const form = useForm({
		schema,
		initialInput: { email: '' },
		validate: 'input',
	});
	const field = useField(form, { path: ['email'] });

	<div>
		<output data-value>{field.input as string}</output>
		<output data-error>{field.errors?.[0] ?? ''}</output>
		<button id="set-valid" type="button" onClick={() => field.onChange('valid@example.com')}>
			Set valid
		</button>
	</div>
}
