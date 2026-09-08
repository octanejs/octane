import Select from '../../src/index';
import type { Ref } from '../../src/components.tsrx';
import type { ActionMeta, OnChangeValue, Options, SelectInstance } from '../../src/index';
import type { BrowserSelectOption } from './select-fixture.tsrx';

export function MultiSelectFixture(props: {
	options: readonly BrowserSelectOption[];
	defaultValue: readonly BrowserSelectOption[];
	ref?: Ref<SelectInstance<BrowserSelectOption, true>>;
	isOptionDisabled?: (option: BrowserSelectOption, selectValue: Options<
		BrowserSelectOption
	>) => boolean;
	onChange: (value: OnChangeValue<BrowserSelectOption, true>, actionMeta: ActionMeta<
		BrowserSelectOption
	>) => void;
}) @{
	<Select {...props} instanceId="multi-browser" isMulti={true} name="multi-choice" />
}
