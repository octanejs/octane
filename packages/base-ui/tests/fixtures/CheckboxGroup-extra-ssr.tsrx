import * as React from 'octane';
import * as ReactDOM from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import { CheckboxGroup } from '@octanejs/base-ui/checkbox-group';
import { Checkbox } from '@octanejs/base-ui/checkbox';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';

export function CheckboxGroupExtraFixture1({
	nativeButton,
	parent,
}: {
	nativeButton: boolean;
	parent: boolean;
}) {
	return <Field.Root name="apple">
		<CheckboxGroup allValues={['fuji']}>
			<Field.Item>
				<Field.Label data-testid="label">Fuji</Field.Label>
				<Checkbox.Root
					parent={parent}
					value={parent ? undefined : 'fuji'}
					nativeButton={nativeButton}
					render={nativeButton ? <button /> : undefined}
				/>
			</Field.Item>
		</CheckboxGroup>
	</Field.Root>;
}

export function CheckboxGroupExtraFixture2({
	nativeButton,
	parent,
}: {
	nativeButton: boolean;
	parent: boolean;
}) {
	return <Field.Root name="apple">
		<CheckboxGroup allValues={['fuji']}>
			<Field.Item>
				<Field.Label data-testid="label">All</Field.Label>
				<Checkbox.Root
					parent
					data-testid="parent"
					nativeButton={nativeButton}
					render={nativeButton ? <button /> : undefined}
				/>
			</Field.Item>
			<Field.Item>
				<Field.Label data-testid="label">Fuji</Field.Label>
				<Checkbox.Root
					value="fuji"
					data-testid="fuji"
					nativeButton={nativeButton}
					render={nativeButton ? <button /> : undefined}
				/>
			</Field.Item>
		</CheckboxGroup>
	</Field.Root>;
}
