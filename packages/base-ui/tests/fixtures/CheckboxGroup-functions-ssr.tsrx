import * as React from 'octane';
import * as ReactDOM from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import { CheckboxGroup } from '@octanejs/base-ui/checkbox-group';
import { Checkbox } from '@octanejs/base-ui/checkbox';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';

export function CheckboxGroupHydrationFixture1(props: { nativeButton: boolean }) {
	const { nativeButton } = props;
	const checkboxProps = { nativeButton, render: nativeButton ? <button /> : undefined };

	return <Field.Root name="apples">
		<Field.Label>Apples</Field.Label>
		<CheckboxGroup allValues={['fuji', 'gala']}>
			<Checkbox.Root parent data-testid="parent" {...checkboxProps} />
			<Checkbox.Root value="fuji" data-testid="fuji" {...checkboxProps} />
			<Checkbox.Root value="gala" data-testid="gala" {...checkboxProps} />
		</CheckboxGroup>
	</Field.Root>;
}
