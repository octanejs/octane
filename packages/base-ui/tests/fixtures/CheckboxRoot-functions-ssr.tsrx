import * as React from 'octane';
import { Checkbox } from '@octanejs/base-ui/checkbox';
import { CheckboxGroup } from '@octanejs/base-ui/checkbox-group';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';

export function CheckboxRootHydrationFixture1(props: {
	checkboxId?: string | undefined;
	checkboxKey?: React.Key | undefined;
	nativeButton: boolean;
}) {
	const { checkboxId, checkboxKey, nativeButton } = props;

	return <Field.Root>
		<Field.Label data-testid="label">Label</Field.Label>
		<Checkbox.Root
			key={checkboxKey}
			id={checkboxId}
			nativeButton={nativeButton}
			render={nativeButton ? <button /> : undefined}
		/>
	</Field.Root>;
}
