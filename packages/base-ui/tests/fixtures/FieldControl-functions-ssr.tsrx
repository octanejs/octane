import * as React from 'octane';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';

export function FieldControlHydrationFixture1() {
	return <Field.Root data-testid="root">
		<Field.Label data-testid="label">Name</Field.Label>
		<Field.Control autoFocus />
	</Field.Root>;
}
