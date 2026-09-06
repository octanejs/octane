import * as React from 'octane';
import { Checkbox } from '@octanejs/base-ui/checkbox';
import { CheckboxGroup } from '@octanejs/base-ui/checkbox-group';
import { Field } from '@octanejs/base-ui/field';

export function CheckboxRootreact17ExtraFixture1({ nativeButton }: { nativeButton: boolean }) {
	return <Field.Root name="apple">
		<CheckboxGroup allValues={['fuji']}>
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
