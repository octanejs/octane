import { Field, Form, useForm } from '@octanejs/formisch';
import { createRoot, useState } from 'octane';
import * as v from 'valibot';

const Schema = v.object({
	email: v.pipe(v.string(), v.nonEmpty('Email is required'), v.email('Email is invalid')),
});

function App() {
	const [submitted, setSubmitted] = useState('none');
	const form = useForm({ schema: Schema });
	return <Form of={form} onSubmit={(output) => setSubmitted(output.email)}>
		<Field of={form} path={['email']}>
			{(field) => <label>
				Email
				<input {...field.props} value={field.input} />
				<output id="dirty">
					{field.isDirty ? 'dirty' : 'pristine'}
				</output>
				<output id="error">{field.errors?.[0] ?? 'ok'}</output>
			</label>}
		</Field>
		<button type="submit">Submit</button>
		<output id="submitted">{submitted}</output>
	</Form>;
}

createRoot(document.querySelector('#root')!).render(App);
