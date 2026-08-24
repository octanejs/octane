/** @jsxImportSource octane */
import * as v from 'valibot';

import { Field, Form, useForm } from '../../src/index.js';

const Schema = v.object({ name: v.string() });

export function HydrationForm() {
	const form = useForm({ schema: Schema });
	return (
		<Form of={form}>
			<Field of={form} path={['name']}>
				{(field) => (
					<>
						<input aria-label="name" {...field.props} value={field.input} />
						<output data-dirty="">{field.isDirty ? 'dirty' : 'pristine'}</output>
					</>
				)}
			</Field>
		</Form>
	);
}
